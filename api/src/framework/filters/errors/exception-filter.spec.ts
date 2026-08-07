import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  MethodNotAllowedException,
  NotFoundException,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { QueryFailedError } from 'typeorm';
import { z } from 'zod';

import { BusinessRuleViolationError, ScheduleConflictError } from '@/shared/errors/types';

import { AllExceptionsFilter } from './exception-filter';

interface CapturedResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Dobra do `ArgumentsHost`: o filtro só precisa de `status().json()`. Captura o
 * que foi para o cliente — que é exatamente o que o contrato de erro promete.
 */
function capture(): { host: ArgumentsHost; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, body: {} };

  const response = {
    status(code: number) {
      captured.status = code;
      return {
        json(body: Record<string, unknown>) {
          captured.body = body;
        },
      };
    },
  };

  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;

  return { host, captured };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let logError: jest.SpyInstance;
  let logWarn: jest.SpyInstance;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    // Silencia e observa: o log é onde o detalhe técnico pode aparecer — e é o
    // único lugar onde ele pode.
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    logWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ramo 1 — validação do Zod', () => {
    const zodError = z
      .object({ scheduledAt: z.string(), patient: z.object({ id: z.string().uuid() }) })
      .safeParse({ patient: { id: 'não-é-uuid' } });

    it('devolve 400 VALIDATION_ERROR com details[] e path em string', () => {
      if (zodError.success) throw new Error('arranjo inválido: o schema deveria ter rejeitado');

      const { host, captured } = capture();

      filter.catch(new ZodValidationException(zodError.error), host);

      expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
      expect(captured.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Requisição inválida.',
      });
      expect(captured.body.details).toEqual([
        { path: 'scheduledAt', message: expect.any(String) },
        { path: 'patient.id', message: expect.any(String) },
      ]);
    });
  });

  describe('ramo 2 — erro de domínio', () => {
    it('traduz o `code` para o status do catálogo e preserva a mensagem da classe', () => {
      const { host, captured } = capture();

      filter.catch(new ScheduleConflictError('Já existe um agendamento neste horário.'), host);

      expect(captured.status).toBe(HttpStatus.CONFLICT);
      expect(captured.body).toEqual({
        statusCode: 409,
        code: 'SCHEDULE_CONFLICT',
        message: 'Já existe um agendamento neste horário.',
      });
    });

    it('mapeia regra de negócio violada para 422', () => {
      const { host, captured } = capture();

      filter.catch(new BusinessRuleViolationError('Consulta cancelada não pode ser concluída.'), host);

      expect(captured.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(captured.body).toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
    });
  });

  describe('ramo 3 — violação de unicidade no banco', () => {
    it('devolve 409 humano e não vaza nome de constraint nem SQL', () => {
      const driverError = Object.assign(
        new Error(
          'duplicate key value violates unique constraint "uk_appointments_doctor_slot"',
        ),
        { code: '23505' },
      );
      const exception = new QueryFailedError(
        'INSERT INTO appointments ...',
        [],
        driverError,
      );
      const { host, captured } = capture();

      filter.catch(exception, host);

      expect(captured.status).toBe(HttpStatus.CONFLICT);
      expect(captured.body).toEqual({
        statusCode: 409,
        code: 'SCHEDULE_CONFLICT',
        message: 'Já existe um agendamento neste horário.',
      });

      const serialized = JSON.stringify(captured.body);
      expect(serialized).not.toContain('uk_appointments_doctor_slot');
      expect(serialized).not.toContain('INSERT INTO');
      // O detalhe técnico não some: ele vai para o log, e só para lá.
      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('uk_appointments_doctor_slot'));
    });

    it('falha de banco que não é unicidade cai no ramo genérico', () => {
      const driverError = Object.assign(new Error('relation "patients" does not exist'), {
        code: '42P01',
      });
      const { host, captured } = capture();

      filter.catch(new QueryFailedError('SELECT ...', [], driverError), host);

      expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(captured.body).toMatchObject({ code: 'INTERNAL_ERROR' });
      expect(JSON.stringify(captured.body)).not.toContain('patients');
    });
  });

  describe('ramo 4 — HttpException do Nest', () => {
    it('deriva o `code` do status e responde em PT-BR', () => {
      const { host, captured } = capture();

      filter.catch(new NotFoundException(), host);

      expect(captured.status).toBe(HttpStatus.NOT_FOUND);
      expect(captured.body).toEqual({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Recurso não encontrado.',
      });
    });

    it('status fora do catálogo vira INTERNAL_ERROR, com o status preservado', () => {
      const { host, captured } = capture();

      filter.catch(new MethodNotAllowedException(), host);

      expect(captured.status).toBe(HttpStatus.METHOD_NOT_ALLOWED);
      expect(captured.body).toEqual({
        statusCode: 405,
        code: 'INTERNAL_ERROR',
        // Sem mensagem própria mapeada, cai na genérica — que também é PT-BR.
        message: expect.stringContaining('erro inesperado'),
      });
    });

    it('não repassa a mensagem em inglês do Nest', () => {
      const { host, captured } = capture();

      filter.catch(new HttpException('Cannot GET /api/foo', HttpStatus.NOT_FOUND), host);

      expect(captured.body.message).toBe('Recurso não encontrado.');
    });
  });

  describe('ramo 5 — o inesperado', () => {
    it('devolve 500 genérico e manda a stack só para o log', () => {
      const exception = new Error('conexão recusada em 10.0.0.7:5432');
      const { host, captured } = capture();

      filter.catch(exception, host);

      expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(captured.body).toEqual({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: expect.stringContaining('erro inesperado'),
      });
      expect(JSON.stringify(captured.body)).not.toContain('10.0.0.7');
      expect(logError).toHaveBeenCalledWith('Erro não tratado', exception.stack);
    });

    it('sobrevive a `throw` de algo que não é Error', () => {
      const { host, captured } = capture();

      expect(() => filter.catch('explodiu', host)).not.toThrow();

      expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(captured.body).toMatchObject({ code: 'INTERNAL_ERROR' });
      expect(logError).toHaveBeenCalledWith('Erro não tratado', 'explodiu');
    });
  });

  it('details[] é exclusivo do 400 — nunca aparece nos outros ramos', () => {
    const casos: unknown[] = [
      new ScheduleConflictError('conflito'),
      new NotFoundException(),
      new Error('qualquer coisa'),
    ];

    for (const caso of casos) {
      const { host, captured } = capture();

      filter.catch(caso, host);

      expect(captured.body).not.toHaveProperty('details');
    }
  });
});
