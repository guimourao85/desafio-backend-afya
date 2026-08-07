import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { QueryFailedError } from 'typeorm';

import { DomainError, DomainErrorCode, ErrorCode } from '@/shared/errors/types';

/** O envelope único de erro da API (PLAN.md §9.4). `details` existe só no 400. */
interface ErrorEnvelope {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: { path: string; message: string }[];
}

/** A superfície de resposta que o filtro usa — o transporte concreto não importa aqui. */
interface HttpResponse {
  status(code: number): { json(body: ErrorEnvelope): void };
}

const GENERIC_MESSAGE =
  'Ocorreu um erro inesperado ao processar sua solicitação. Tente novamente; se o problema persistir, contate o suporte.';

/** `code` do domínio → status HTTP. É aqui que o domínio vira transporte. */
const STATUS_BY_DOMAIN_CODE: Record<DomainErrorCode, number> = {
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  INVALID_REFRESH_TOKEN: HttpStatus.UNAUTHORIZED,
  RESOURCE_NOT_FOUND: HttpStatus.NOT_FOUND,
  SCHEDULE_CONFLICT: HttpStatus.CONFLICT,
  BUSINESS_RULE_VIOLATION: HttpStatus.UNPROCESSABLE_ENTITY,
};

/**
 * Status → `code`, para a `HttpException` que o próprio Nest lança. Sem esta regra
 * o campo `code` seria opcional na prática. Status fora da tabela cai em
 * `INTERNAL_ERROR`: inventar um `code` por status infla o contrato do Swagger.
 */
const CODE_BY_STATUS: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
  [HttpStatus.CONFLICT]: 'SCHEDULE_CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'BUSINESS_RULE_VIOLATION',
};

/** Sem isto, uma URL errada responde `Cannot GET /api/foo` — inglês, violando ADR-13. */
const MESSAGE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Requisição inválida.',
  [HttpStatus.UNAUTHORIZED]: 'Autenticação necessária.',
  [HttpStatus.NOT_FOUND]: 'Recurso não encontrado.',
  [HttpStatus.CONFLICT]: 'Conflito com o estado atual do recurso.',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Conteúdo maior que o limite aceito.',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'Formato de conteúdo não suportado.',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Não foi possível processar a requisição.',
};

const PG_UNIQUE_VIOLATION = '23505';

/**
 * A única saída de erro da API: toda exceção vira o mesmo envelope, com `code`
 * estável e mensagem em PT-BR. `@Catch()` sem argumento porque o valor do filtro
 * está justamente no que ele pega e ninguém previu.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const envelope = this.toEnvelope(exception);

    response.status(envelope.statusCode).json(envelope);
  }

  // A ordem importa: `ZodValidationException` é uma `HttpException`, e precisa ser
  // reconhecida antes do ramo 4 para devolver `details[]` em vez de um 400 opaco.
  private toEnvelope(exception: unknown): ErrorEnvelope {
    // 1. Payload rejeitado na borda: o único ramo que produz `details[]`.
    if (exception instanceof ZodValidationException) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
        message: 'Requisição inválida.',
        details: exception.getZodError().issues.map((issue) => ({
          // Zod entrega array (`['address', 'city']`); o contrato publica string.
          path: issue.path.join('.'),
          message: issue.message,
        })),
      };
    }

    // 2. Erro esperado do domínio: a mensagem já nasceu em PT-BR e para humano.
    if (exception instanceof DomainError) {
      return {
        statusCode: STATUS_BY_DOMAIN_CODE[exception.code],
        code: exception.code,
        message: exception.message,
      };
    }

    // 3. Última linha de defesa das invariantes (INV-01). O texto do driver carrega
    //    SQL e nome de índice: vai para o log, nunca para a resposta.
    if (this.isUniqueViolation(exception)) {
      this.logger.warn(`Violação de unicidade no banco: ${exception.message}`);

      return {
        statusCode: HttpStatus.CONFLICT,
        code: 'SCHEDULE_CONFLICT',
        message: 'Já existe um agendamento neste horário.',
      };
    }

    // 4. `HttpException` do próprio Nest: status dele, `code` e mensagem nossos.
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();

      return {
        statusCode,
        code: CODE_BY_STATUS[statusCode] ?? 'INTERNAL_ERROR',
        message: MESSAGE_BY_STATUS[statusCode] ?? GENERIC_MESSAGE,
      };
    }

    // 5. O resto — inclusive `throw 'string'` e qualquer coisa que não seja `Error`.
    this.logger.error(
      'Erro não tratado',
      exception instanceof Error ? exception.stack : String(exception),
    );

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: GENERIC_MESSAGE,
    };
  }

  private isUniqueViolation(exception: unknown): exception is QueryFailedError {
    if (!(exception instanceof QueryFailedError)) return false;

    const driverError = exception.driverError as { code?: string } | undefined;

    return driverError?.code === PG_UNIQUE_VIOLATION;
  }
}
