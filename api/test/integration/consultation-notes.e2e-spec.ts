import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { AppointmentStatus } from '@/domains/domain/model-entities/appointment.entity';
import { ConsultationNote } from '@/domains/domain/model-entities/consultation-note.entity';
import { Doctor } from '@/domains/domain/model-entities/doctor.entity';
import { Patient } from '@/domains/domain/model-entities/patient.entity';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { PasswordHasher } from '@/shared/interfaces/cryptography/password-hasher';

import { truncateAll } from '../factories/truncate-all';

const PASSWORD = 'senha-de-teste-123';
const OWNER_EMAIL = 'e2e.notas.dono@prontomed.dev';
const OTHER_EMAIL = 'e2e.notas.outro@prontomed.dev';
const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000999';

const JANEIRO = '2026-01-01T09:00:00.000Z';
const FEVEREIRO = '2026-02-10T09:00:00.000Z';
const MAIO = '2026-05-15T09:00:00.000Z';

/**
 * Anotações e linha do tempo ponta a ponta (RF-05, RF-06).
 *
 * É aqui que as duas garantias que só o banco dá deixam de ser intenção: o `CHECK`
 * de conteúdo não vazio e a FK que impede apagar uma consulta com anotação. E é aqui
 * que INV-03 vira contagem — anonimizar o paciente e conferir que o número de notas
 * não mudou.
 */
describe('Anotações e linha do tempo (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let ownerId: string;
  let otherId: string;
  let ownerToken: string;
  let otherToken: string;
  let patientId: string;
  let otherPatientId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function agendar(token: string, patient: string, scheduledAt: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/appointments')
      .set(auth(token))
      .send({ patientId: patient, scheduledAt })
      .expect(201);

    return response.body.id as string;
  }

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

    const [owner, other] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: OWNER_EMAIL, password: PASSWORD }),
      request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: OTHER_EMAIL, password: PASSWORD }),
    ]);

    ownerToken = owner.body.accessToken as string;
    otherToken = other.body.accessToken as string;
  });

  describe('POST /api/appointments/:id/notes', () => {
    it('registra a anotação e devolve 201 com id e carimbo', async () => {
      const appointmentId = await agendar(ownerToken, patientId, JANEIRO);

      const response = await request(app.getHttpServer())
        .post(`/api/appointments/${appointmentId}/notes`)
        .set(auth(ownerToken))
        .send({ content: 'Paciente relatou dor lombar há três dias.' })
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(String),
        content: 'Paciente relatou dor lombar há três dias.',
        createdAt: expect.any(String),
      });
      // `appointmentId` não vaza no corpo: a nota só aparece dentro da consulta.
      expect(response.body).not.toHaveProperty('appointmentId');
    });

    it('consulta concluída aceita anotação — anota-se depois de atender', async () => {
      const appointmentId = await agendar(ownerToken, patientId, JANEIRO);

      await request(app.getHttpServer())
        .patch(`/api/appointments/${appointmentId}`)
        .set(auth(ownerToken))
        .send({ status: AppointmentStatus.COMPLETED })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/appointments/${appointmentId}/notes`)
        .set(auth(ownerToken))
        .send({ content: 'Prescrito anti-inflamatório por 5 dias.' })
        .expect(201);
    });

    // INV-05.
    it('consulta cancelada recusa com 422 e não grava nada', async () => {
      const appointmentId = await agendar(ownerToken, patientId, JANEIRO);

      await request(app.getHttpServer())
        .delete(`/api/appointments/${appointmentId}`)
        .set(auth(ownerToken))
        .expect(204);

      const response = await request(app.getHttpServer())
        .post(`/api/appointments/${appointmentId}/notes`)
        .set(auth(ownerToken))
        .send({ content: 'não deve entrar' })
        .expect(422);

      expect(response.body).toMatchObject({
        code: 'BUSINESS_RULE_VIOLATION',
        message: 'Consulta cancelada não aceita anotações.',
      });
      expect(await dataSource.getRepository(ConsultationNote).count()).toBe(0);
    });

    // INV-04: inexistente e alheia têm de ser indistinguíveis.
    it('consulta de outro médico responde 404, igual à inexistente', async () => {
      const alheia = await agendar(otherToken, otherPatientId, JANEIRO);

      const doOutro = await request(app.getHttpServer())
        .post(`/api/appointments/${alheia}/notes`)
        .set(auth(ownerToken))
        .send({ content: 'invasão' })
        .expect(404);

      const inexistente = await request(app.getHttpServer())
        .post(`/api/appointments/${UUID_INEXISTENTE}/notes`)
        .set(auth(ownerToken))
        .send({ content: 'invasão' })
        .expect(404);

      expect(doOutro.body).toEqual(inexistente.body);
      expect(await dataSource.getRepository(ConsultationNote).count()).toBe(0);
    });

    it.each([
      ['vazio', ''],
      ['só espaços', '     '],
      ['acima de 5000 caracteres', 'x'.repeat(5001)],
    ])('recusa content %s com 400', async (_caso, content) => {
      const appointmentId = await agendar(ownerToken, patientId, JANEIRO);

      const response = await request(app.getHttpServer())
        .post(`/api/appointments/${appointmentId}/notes`)
        .set(auth(ownerToken))
        .send({ content })
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('recusa campo desconhecido no corpo com 400', async () => {
      const appointmentId = await agendar(ownerToken, patientId, JANEIRO);

      await request(app.getHttpServer())
        .post(`/api/appointments/${appointmentId}/notes`)
        .set(auth(ownerToken))
        .send({ content: 'ok', autor: 'quem escreveu' })
        .expect(400);
    });

    /**
     * A regressão da decisão 18, e a razão de este teste existir com **três**
     * anotações em vez de uma: o caso quebrado é a segunda gravação. O service lê a
     * raiz sem `relations`, então a coleção chega parcial ao adapter; a implementação
     * ingênua (`save(raiz)` com `cascade`) leria essa lista curta como o estado
     * completo e desassociaria as notas já gravadas — `appointment_id` nulo, que só
     * não vira dado corrompido porque a coluna é `NOT NULL`.
     */
    it('a anotação chega no detalhe da consulta, na ordem em que foi escrita', async () => {
      const appointmentId = await agendar(ownerToken, patientId, JANEIRO);

      for (const content of ['primeira', 'segunda', 'terceira']) {
        await request(app.getHttpServer())
          .post(`/api/appointments/${appointmentId}/notes`)
          .set(auth(ownerToken))
          .send({ content })
          .expect(201);
      }

      const response = await request(app.getHttpServer())
        .get(`/api/appointments/${appointmentId}`)
        .set(auth(ownerToken))
        .expect(200);

      expect(response.body.notes.map((note: { content: string }) => note.content)).toEqual([
        'primeira',
        'segunda',
        'terceira',
      ]);

      // O outro lado da mesma regressão, medido no banco: nenhuma nota ficou órfã
      // nem perdeu o vínculo com a consulta.
      const orfas = await dataSource.query(
        'SELECT count(*)::int AS total FROM consultation_notes WHERE appointment_id <> $1',
        [appointmentId],
      );
      expect(orfas[0].total).toBe(0);
      expect(await dataSource.getRepository(ConsultationNote).count()).toBe(3);
    });

    /**
     * O contrário do teste acima, e a regressão que a fricção PÓS desta sprint
     * pegou: carregar as anotações dentro de `findByIdForDoctor` — em vez de num
     * método separado — fazia **toda** rota que lê um agendamento passar a publicar
     * `notes`, inclusive o `PATCH`, que só reescreve uma coluna.
     *
     * O campo é ausente, e não `[]`, porque estas rotas não leram as anotações:
     * `notes: []` diria "esta consulta não tem nenhuma", o que pode ser falso.
     */
    it.each([
      ['a listagem da agenda', 'GET', '/api/appointments'],
      ['o reagendamento', 'PATCH', ''],
      ['o agendamento recém-criado', 'POST', ''],
    ])('%s não publica o campo notes', async (_caso, metodo) => {
      const appointmentId = await agendar(ownerToken, patientId, JANEIRO);

      await request(app.getHttpServer())
        .post(`/api/appointments/${appointmentId}/notes`)
        .set(auth(ownerToken))
        .send({ content: 'existe, mas estas rotas não leram' })
        .expect(201);

      if (metodo === 'GET') {
        const response = await request(app.getHttpServer())
          .get('/api/appointments')
          .set(auth(ownerToken))
          .expect(200);

        expect(response.body.data[0]).not.toHaveProperty('notes');
        return;
      }

      if (metodo === 'PATCH') {
        const response = await request(app.getHttpServer())
          .patch(`/api/appointments/${appointmentId}`)
          .set(auth(ownerToken))
          .send({ scheduledAt: MAIO })
          .expect(200);

        expect(response.body).not.toHaveProperty('notes');
        return;
      }

      const response = await request(app.getHttpServer())
        .post('/api/appointments')
        .set(auth(ownerToken))
        .send({ patientId, scheduledAt: FEVEREIRO })
        .expect(201);

      expect(response.body).not.toHaveProperty('notes');
    });
  });

  describe('GET /api/patients/:id/appointments', () => {
    it('devolve a história do mais recente para trás, com as anotações', async () => {
      const janeiro = await agendar(ownerToken, patientId, JANEIRO);
      const maio = await agendar(ownerToken, patientId, MAIO);
      await agendar(ownerToken, patientId, FEVEREIRO);

      await request(app.getHttpServer())
        .post(`/api/appointments/${janeiro}/notes`)
        .set(auth(ownerToken))
        .send({ content: 'consulta de janeiro' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/api/patients/${patientId}/appointments`)
        .set(auth(ownerToken))
        .expect(200);

      expect(response.body.data.map((item: { id: string }) => item.id)[0]).toBe(maio);
      expect(response.body.meta).toEqual({ page: 1, perPage: 20, total: 3, totalPages: 1 });

      const deJaneiro = response.body.data.find((item: { id: string }) => item.id === janeiro);
      expect(deJaneiro.notes).toHaveLength(1);
      expect(deJaneiro.notes[0].content).toBe('consulta de janeiro');
    });

    it('consulta sem anotação vem com notes vazio, nunca null nem ausente', async () => {
      await agendar(ownerToken, patientId, JANEIRO);

      const response = await request(app.getHttpServer())
        .get(`/api/patients/${patientId}/appointments`)
        .set(auth(ownerToken))
        .expect(200);

      expect(response.body.data[0].notes).toEqual([]);
    });

    it('inclui consultas canceladas, com o status', async () => {
      const cancelada = await agendar(ownerToken, patientId, JANEIRO);

      await request(app.getHttpServer())
        .delete(`/api/appointments/${cancelada}`)
        .set(auth(ownerToken))
        .expect(204);

      const response = await request(app.getHttpServer())
        .get(`/api/patients/${patientId}/appointments`)
        .set(auth(ownerToken))
        .expect(200);

      expect(response.body.data[0]).toMatchObject({ id: cancelada, status: 'CANCELLED' });
    });

    // A regressão que este teste trava: paginar sobre um `JOIN` sem cuidado faz a
    // página devolver linhas multiplicadas pelas anotações, em vez de consultas.
    it('pagina por consulta, não por anotação', async () => {
      const janeiro = await agendar(ownerToken, patientId, JANEIRO);
      await agendar(ownerToken, patientId, MAIO);

      for (const content of ['a', 'b', 'c']) {
        await request(app.getHttpServer())
          .post(`/api/appointments/${janeiro}/notes`)
          .set(auth(ownerToken))
          .send({ content })
          .expect(201);
      }

      const response = await request(app.getHttpServer())
        .get(`/api/patients/${patientId}/appointments?perPage=1`)
        .set(auth(ownerToken))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta).toMatchObject({ total: 2, totalPages: 2 });
    });

    it('paciente sem consultas devolve 200 com data vazio, não 404', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/patients/${patientId}/appointments`)
        .set(auth(ownerToken))
        .expect(200);

      expect(response.body).toEqual({
        data: [],
        meta: { page: 1, perPage: 20, total: 0, totalPages: 0 },
      });
    });

    it('página além do fim devolve 200 com data vazio e o total real', async () => {
      await agendar(ownerToken, patientId, JANEIRO);

      const response = await request(app.getHttpServer())
        .get(`/api/patients/${patientId}/appointments?page=2`)
        .set(auth(ownerToken))
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.meta.total).toBe(1);
    });

    it('paciente de outro médico responde 404, igual ao inexistente', async () => {
      const doOutro = await request(app.getHttpServer())
        .get(`/api/patients/${otherPatientId}/appointments`)
        .set(auth(ownerToken))
        .expect(404);

      const inexistente = await request(app.getHttpServer())
        .get(`/api/patients/${UUID_INEXISTENTE}/appointments`)
        .set(auth(ownerToken))
        .expect(404);

      expect(doOutro.body).toEqual(inexistente.body);
    });
  });

  describe('garantias do banco', () => {
    // INV-03 medida, não afirmada: conta antes, anonimiza, conta depois.
    it('anonimizar o paciente preserva consultas e anotações', async () => {
      const appointmentId = await agendar(ownerToken, patientId, JANEIRO);

      for (const content of ['primeira', 'segunda']) {
        await request(app.getHttpServer())
          .post(`/api/appointments/${appointmentId}/notes`)
          .set(auth(ownerToken))
          .send({ content })
          .expect(201);
      }

      const notas = dataSource.getRepository(ConsultationNote);
      const antes = await notas.count();

      await request(app.getHttpServer())
        .delete(`/api/patients/${patientId}`)
        .set(auth(ownerToken))
        .expect(204);

      expect(await notas.count()).toBe(antes);

      const timeline = await request(app.getHttpServer())
        .get(`/api/patients/${patientId}/appointments`)
        .set(auth(ownerToken))
        .expect(200);

      expect(timeline.body.data[0].notes).toHaveLength(2);
    });

    // Decisão 15: a FK é `NO ACTION` de propósito. Um `CASCADE` daria a um `DELETE`
    // manual o poder de sumir com registro clínico — e a API nem tem `DELETE`
    // físico, cancelar é `status = CANCELLED`.
    it('apagar fisicamente uma consulta com anotação é recusado pelo banco', async () => {
      const appointmentId = await agendar(ownerToken, patientId, JANEIRO);

      await request(app.getHttpServer())
        .post(`/api/appointments/${appointmentId}/notes`)
        .set(auth(ownerToken))
        .send({ content: 'registro clínico' })
        .expect(201);

      await expect(
        dataSource.query('DELETE FROM appointments WHERE id = $1', [appointmentId]),
      ).rejects.toThrow(/fk_consultation_notes_appointments/);
    });

    // O `.min(1)` do Zod para na borda HTTP; este `CHECK` para o que entra por
    // baixo dela — seed, migration, correção manual.
    it('o banco recusa anotação vazia mesmo por SQL direto', async () => {
      const appointmentId = await agendar(ownerToken, patientId, JANEIRO);

      await expect(
        dataSource.query('INSERT INTO consultation_notes (appointment_id, content) VALUES ($1, $2)', [
          appointmentId,
          '   ',
        ]),
      ).rejects.toThrow(/ck_consultation_notes_content_not_empty/);
    });
  });
});
