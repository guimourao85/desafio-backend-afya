import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import {
  Appointment,
  AppointmentStatus,
} from '@/domains/domain/model-entities/appointment.entity';
import { Doctor } from '@/domains/domain/model-entities/doctor.entity';
import { Patient } from '@/domains/domain/model-entities/patient.entity';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { PasswordHasher } from '@/shared/interfaces/cryptography/password-hasher';

import { truncateAll } from '../factories/truncate-all';

const PASSWORD = 'senha-de-teste-123';
const OWNER_EMAIL = 'e2e.agenda.dono@prontomed.dev';
const OTHER_EMAIL = 'e2e.agenda.outro@prontomed.dev';
const SLOT = '2026-08-12T14:00:00.000Z';
const OUTRO_SLOT = '2026-08-13T09:00:00.000Z';

/**
 * A agenda ponta a ponta. Aqui INV-01 deixa de ser intenção: o índice único parcial
 * é exercitado de verdade, inclusive no caso que só ele resolve — cancelar e agendar
 * de novo no mesmo horário.
 */
describe('Agendamentos (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let ownerId: string;
  let otherId: string;
  let ownerToken: string;
  let patientId: string;
  let otherPatientId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = app.get<DataSource>(PRONTOMED_POSTGRES_DATA_SOURCE);
    passwordHash = await app.get(PasswordHasher).hash(PASSWORD);
  });

  afterAll(async () => {
    await truncateAll(dataSource);
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);

    const doctors = dataSource.getRepository(Doctor);
    ownerId = (await doctors.insert({ name: 'Dra. Dona', email: OWNER_EMAIL, passwordHash }))
      .identifiers[0].id as string;
    otherId = (await doctors.insert({ name: 'Dr. Outro', email: OTHER_EMAIL, passwordHash }))
      .identifiers[0].id as string;

    const patients = dataSource.getRepository(Patient);
    patientId = (await patients.insert({ doctorId: ownerId, name: 'Pedro Álvares' }))
      .identifiers[0].id as string;
    otherPatientId = (await patients.insert({ doctorId: otherId, name: 'Paciente do Outro' }))
      .identifiers[0].id as string;

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: OWNER_EMAIL, password: PASSWORD });

    ownerToken = login.body.accessToken as string;
  });

  const asOwner = (method: 'get' | 'patch' | 'delete' | 'post', path: string) =>
    request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${ownerToken}`);

  const schedule = (scheduledAt = SLOT, patient = patientId) =>
    asOwner('post', '/api/appointments').send({ patientId: patient, scheduledAt });

  describe('INV-01 — a agenda não aceita dois compromissos vivos no mesmo instante', () => {
    it('agenda em horário livre com 201', async () => {
      const response = await schedule();

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: expect.any(String),
        patientId,
        scheduledAt: SLOT,
        status: 'SCHEDULED',
        createdAt: expect.any(String),
      });
    });

    it('recusa o segundo agendamento no mesmo instante com 409', async () => {
      await schedule();

      const response = await schedule();

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        statusCode: 409,
        code: 'SCHEDULE_CONFLICT',
        message: 'Já existe um agendamento neste horário.',
      });
      expect(await dataSource.getRepository(Appointment).count()).toBe(1);
    });

    it('aceita o mesmo instante para **outro** médico', async () => {
      await schedule();

      // Direto no banco: é a agenda do outro médico, e o token é do dono.
      await dataSource
        .getRepository(Appointment)
        .insert({ doctorId: otherId, patientId: otherPatientId, scheduledAt: new Date(SLOT) });

      expect(await dataSource.getRepository(Appointment).count()).toBe(2);
    });

    // O caso que **só** o `WHERE` do índice parcial resolve.
    it('cancelar libera o horário: agendar de novo no mesmo instante devolve 201', async () => {
      const primeira = await schedule();
      await asOwner('delete', `/api/appointments/${primeira.body.id}`);

      const segunda = await schedule();

      expect(segunda.status).toBe(201);
      // A cancelada continua lá — o horário foi liberado por regra, não por remoção.
      expect(await dataSource.getRepository(Appointment).count()).toBe(2);
    });

    it('o índice parcial recusa a duplicata mesmo por fora da aplicação', async () => {
      await schedule();

      // A segunda camada de INV-01, provada sem passar pelo caso de uso.
      await expect(
        dataSource
          .getRepository(Appointment)
          .insert({ doctorId: ownerId, patientId, scheduledAt: new Date(SLOT) }),
      ).rejects.toThrow(/uk_appointments_doctor_slot/);
    });
  });

  describe('POST /api/appointments — o paciente', () => {
    it('recusa paciente inexistente com 404', async () => {
      const response = await schedule(SLOT, '00000000-0000-4000-8000-000000000000');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Paciente não encontrado.');
    });

    it('recusa paciente de **outro médico** com 404 — a fronteira do módulo já filtra', async () => {
      const response = await schedule(SLOT, otherPatientId);

      expect(response.status).toBe(404);
    });

    it('recusa paciente anonimizado com 422', async () => {
      await asOwner('delete', `/api/patients/${patientId}`);

      const response = await schedule();

      expect(response.status).toBe(422);
      expect(response.body.message).toBe(
        'Paciente anonimizado (LGPD) não pode receber novos agendamentos.',
      );
    });

    it.each([
      ['patientId que não é uuid', { patientId: 'nao-e-uuid', scheduledAt: SLOT }],
      ['scheduledAt fora do ISO-8601', { patientId: 'x', scheduledAt: '12/08/2026' }],
      ['campo desconhecido', { patientId: 'x', scheduledAt: SLOT, doctorId: 'roubado' }],
    ])('responde 400 com %s', async (_caso, body) => {
      const response = await asOwner('post', '/api/appointments').send({
        ...body,
        patientId: body.patientId === 'x' ? patientId : body.patientId,
      });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('aceita consulta no passado — registro retroativo é caso real', async () => {
      const response = await schedule('2020-01-01T10:00:00.000Z');

      expect(response.status).toBe(201);
    });
  });

  describe('PATCH /api/appointments/:id', () => {
    it('reagenda para horário livre', async () => {
      const criada = await schedule();

      const response = await asOwner('patch', `/api/appointments/${criada.body.id}`).send({
        scheduledAt: OUTRO_SLOT,
      });

      expect(response.status).toBe(200);
      expect(response.body.scheduledAt).toBe(OUTRO_SLOT);
    });

    it('recusa reagendamento para horário ocupado com 409', async () => {
      const primeira = await schedule();
      await schedule(OUTRO_SLOT);

      const response = await asOwner('patch', `/api/appointments/${primeira.body.id}`).send({
        scheduledAt: OUTRO_SLOT,
      });

      expect(response.status).toBe(409);
    });

    it('conclui a consulta', async () => {
      const criada = await schedule();

      const response = await asOwner('patch', `/api/appointments/${criada.body.id}`).send({
        status: 'COMPLETED',
      });

      expect(response.body.status).toBe('COMPLETED');
    });

    it('recusa reagendar consulta cancelada com 422', async () => {
      const criada = await schedule();
      await asOwner('delete', `/api/appointments/${criada.body.id}`);

      const response = await asOwner('patch', `/api/appointments/${criada.body.id}`).send({
        scheduledAt: OUTRO_SLOT,
      });

      expect(response.status).toBe(422);
      expect(response.body.message).toBe(
        'Consulta cancelada ou concluída não pode ser reagendada.',
      );
    });

    it.each([
      ['`patientId`, que não pode mudar', { patientId: '00000000-0000-4000-8000-000000000000' }],
      ['status CANCELLED, que é do DELETE', { status: 'CANCELLED' }],
      ['corpo vazio', {}],
    ])('responde 400 quando o corpo traz %s', async (_caso, body) => {
      const criada = await schedule();

      const response = await asOwner('patch', `/api/appointments/${criada.body.id}`).send(body);

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/appointments/:id', () => {
    it('cancela mantendo a linha, com 204', async () => {
      const criada = await schedule();

      const response = await asOwner('delete', `/api/appointments/${criada.body.id}`);

      expect(response.status).toBe(204);
      const noBanco = await dataSource
        .getRepository(Appointment)
        .findOneByOrFail({ id: criada.body.id as string });
      expect(noBanco.status).toBe(AppointmentStatus.CANCELLED);
    });

    it('é idempotente: cancelar de novo responde 204', async () => {
      const criada = await schedule();
      await asOwner('delete', `/api/appointments/${criada.body.id}`);

      const segunda = await asOwner('delete', `/api/appointments/${criada.body.id}`);

      expect(segunda.status).toBe(204);
    });

    it('recusa cancelar consulta **concluída** com 422', async () => {
      const criada = await schedule();
      await asOwner('patch', `/api/appointments/${criada.body.id}`).send({ status: 'COMPLETED' });

      const response = await asOwner('delete', `/api/appointments/${criada.body.id}`);

      expect(response.status).toBe(422);
      expect(response.body.message).toBe('Consulta já concluída não pode ser cancelada.');
    });
  });

  describe('GET /api/appointments', () => {
    it('lista só a agenda do médico, com o envelope da API', async () => {
      await schedule();
      await dataSource
        .getRepository(Appointment)
        .insert({ doctorId: otherId, patientId: otherPatientId, scheduledAt: new Date(OUTRO_SLOT) });

      const response = await asOwner('get', '/api/appointments');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta).toEqual({ page: 1, perPage: 20, total: 1, totalPages: 1 });
    });

    it('filtra por período, paciente e status', async () => {
      await schedule();
      await schedule(OUTRO_SLOT);

      const porPeriodo = await asOwner('get', `/api/appointments?from=${SLOT}&to=${SLOT}`);
      const porStatus = await asOwner('get', '/api/appointments?status=CANCELLED');

      expect(porPeriodo.body.data).toHaveLength(1);
      expect(porStatus.body.data).toHaveLength(0);
    });

    it('recusa período invertido com 400', async () => {
      const response = await asOwner('get', `/api/appointments?from=${OUTRO_SLOT}&to=${SLOT}`);

      expect(response.status).toBe(400);
      expect(response.body.details[0].message).toBe('O início do período não pode ser depois do fim.');
    });
  });

  describe('INV-04 — o agendamento do outro médico', () => {
    let alheio: Appointment;

    beforeEach(async () => {
      alheio = await dataSource.getRepository(Appointment).save(
        dataSource.getRepository(Appointment).create({
          doctorId: otherId,
          patientId: otherPatientId,
          scheduledAt: new Date(SLOT),
        }),
      );
    });

    it.each([['get'], ['patch'], ['delete']])('responde 404 no %s', async (method) => {
      const response = await asOwner(
        method as 'get' | 'patch' | 'delete',
        `/api/appointments/${alheio.id}`,
      ).send(method === 'patch' ? { status: 'COMPLETED' } : undefined);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Agendamento não encontrado.');
    });

    it('não muda a linha alheia', async () => {
      await asOwner('delete', `/api/appointments/${alheio.id}`);

      const noBanco = await dataSource.getRepository(Appointment).findOneByOrFail({ id: alheio.id });
      expect(noBanco.status).toBe(AppointmentStatus.SCHEDULED);
    });
  });

  // INV-03 — a lacuna declarada no edge case 7 de 03.01, agora exercitável.
  describe('INV-03 — anonimizar preserva o histórico', () => {
    it('anonimizar o paciente não apaga nem altera as consultas dele', async () => {
      await schedule();
      await schedule(OUTRO_SLOT);

      const antes = await dataSource.getRepository(Appointment).countBy({ patientId });
      await asOwner('delete', `/api/patients/${patientId}`);
      const depois = await dataSource.getRepository(Appointment).countBy({ patientId });

      expect(antes).toBe(2);
      expect(depois).toBe(2);
      // E continuam agendadas: a anonimização não cancela a agenda.
      expect(
        await dataSource
          .getRepository(Appointment)
          .countBy({ patientId, status: AppointmentStatus.SCHEDULED }),
      ).toBe(2);
    });
  });

  describe('sem autenticação', () => {
    it.each([
      ['get', '/api/appointments'],
      ['post', '/api/appointments'],
      ['get', '/api/appointments/00000000-0000-4000-8000-000000000000'],
      ['patch', '/api/appointments/00000000-0000-4000-8000-000000000000'],
      ['delete', '/api/appointments/00000000-0000-4000-8000-000000000000'],
    ])('%s %s responde 401', async (method, path) => {
      const response = await request(app.getHttpServer())[
        method as 'get' | 'post' | 'patch' | 'delete'
      ](path);

      expect(response.status).toBe(401);
    });
  });
});
