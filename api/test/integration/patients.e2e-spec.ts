import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { Doctor } from '@/domains/domain/model-entities/doctor.entity';
import { ANONYMIZED_PATIENT_NAME, Patient } from '@/domains/domain/model-entities/patient.entity';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { PasswordHasher } from '@/shared/interfaces/cryptography/password-hasher';

const PASSWORD = 'senha-de-teste-123';
const OWNER_EMAIL = 'e2e.dono@prontomed.dev';
const OTHER_EMAIL = 'e2e.outro@prontomed.dev';

/**
 * Pacientes ponta a ponta, contra o Postgres de verdade.
 *
 * **Dois médicos, de propósito.** Um `where` sem `doctorId` passa em todo teste
 * feliz — só fica vermelho quando existe base alheia para vazar. É por isso que
 * cada rota com `:id` é exercitada duas vezes: como dono e como estranho.
 */
describe('Pacientes (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let ownerId: string;
  let otherId: string;
  let ownerToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = app.get<DataSource>(PRONTOMED_POSTGRES_DATA_SOURCE);
    // Um bcrypt só para o arquivo inteiro: o valor é imutável e cada hash custa ~80 ms.
    passwordHash = await app.get(PasswordHasher).hash(PASSWORD);
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE patients, refresh_tokens, doctors');
    await app.close();
  });

  beforeEach(async () => {
    // `patients` primeiro: a FK barraria a remoção de `doctors` antes dela.
    await dataSource.query('TRUNCATE TABLE patients, refresh_tokens, doctors');

    const doctors = dataSource.getRepository(Doctor);
    ownerId = (
      await doctors.insert({ name: 'Dra. Dona', email: OWNER_EMAIL, passwordHash })
    ).identifiers[0].id as string;
    otherId = (
      await doctors.insert({ name: 'Dr. Outro', email: OTHER_EMAIL, passwordHash })
    ).identifiers[0].id as string;

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: OWNER_EMAIL, password: PASSWORD });

    ownerToken = login.body.accessToken as string;
  });

  /** Cria um paciente direto no banco, para o médico indicado. */
  async function seedPatient(doctorId: string, name = 'Pedro Álvares'): Promise<Patient> {
    const patient = dataSource.getRepository(Patient).create({
      doctorId,
      name,
      phone: '(11) 99999-9999',
      email: 'pedro@example.com',
      birthDate: '1987-01-01',
      sex: null,
      heightM: 1.68,
      weightKg: 75,
      anonymizedAt: null,
    });

    return dataSource.getRepository(Patient).save(patient);
  }

  const asOwner = (method: 'get' | 'patch' | 'delete' | 'post', path: string) =>
    request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${ownerToken}`);

  describe('POST /api/patients', () => {
    it('cadastra e devolve 201 com o corpo do contrato', async () => {
      const response = await asOwner('post', '/api/patients').send({
        name: 'Pedro Álvares',
        phone: '(11) 99999-9999',
        email: 'pedro@example.com',
        birthDate: '1987-01-01',
        sex: 'MALE',
        heightM: 1.68,
        weightKg: 75,
      });

      expect(response.status).toBe(201);
      expect(Object.keys(response.body).sort()).toEqual([
        'anonymized',
        'birthDate',
        'createdAt',
        'email',
        'heightM',
        'id',
        'name',
        'phone',
        'sex',
        'weightKg',
      ]);
      expect(response.body.anonymized).toBe(false);
    });

    // A armadilha do `numeric`: sem transformer, isto volta `"1.68"`.
    it('devolve altura e peso como **número**, não string', async () => {
      const response = await asOwner('post', '/api/patients').send({
        name: 'Pedro',
        heightM: 1.68,
        weightKg: 75.5,
      });

      expect(typeof response.body.heightM).toBe('number');
      expect(response.body.heightM).toBe(1.68);
      expect(response.body.weightKg).toBe(75.5);
    });

    // A armadilha do `date`: `timestamptz` devolveria com hora e deslocaria o dia.
    it('devolve o nascimento como data pura, sem hora e sem fuso', async () => {
      const response = await asOwner('post', '/api/patients').send({
        name: 'Pedro',
        birthDate: '1987-01-01',
      });

      expect(response.body.birthDate).toBe('1987-01-01');
    });

    it('cadastra só com o nome', async () => {
      const response = await asOwner('post', '/api/patients').send({ name: 'Minimo Viavel' });

      expect(response.status).toBe(201);
      expect(response.body.phone).toBeNull();
    });

    it('vincula ao médico do token, mesmo com `doctorId` no corpo', async () => {
      const response = await asOwner('post', '/api/patients').send({
        name: 'Pedro',
        doctorId: otherId,
      });

      // O `.strict()` recusa antes de chegar ao service: INV-04 não depende de o
      // caso de uso lembrar de ignorar o campo.
      expect(response.status).toBe(400);
      expect(response.body.details[0].message).toBe('Campo desconhecido no corpo da requisição.');
    });

    it.each([
      ['altura acima da faixa', { name: 'X', heightM: 3.0 }],
      ['altura abaixo da faixa', { name: 'X', heightM: 0.1 }],
      ['peso negativo', { name: 'X', weightKg: -1 }],
      ['nascimento no futuro', { name: 'X', birthDate: '2099-01-01' }],
      ['nascimento em formato errado', { name: 'X', birthDate: '01/01/1987' }],
      ['sexo fora do enum', { name: 'X', sex: 'ALIEN' }],
      ['email inválido', { name: 'X', email: 'nao-e-email' }],
      ['sem nome', { phone: '(11) 1111-1111' }],
    ])('responde 400 com `details[]` quando o corpo vem com %s', async (_caso, body) => {
      const response = await asOwner('post', '/api/patients').send(body);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.details.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/patients', () => {
    it('lista só os do médico autenticado, e conta só os dele', async () => {
      await seedPatient(ownerId, 'Ana');
      await seedPatient(ownerId, 'Bruno');
      await seedPatient(otherId, 'Paciente do Outro');

      const response = await asOwner('get', '/api/patients');

      expect(response.status).toBe(200);
      expect(response.body.data.map((p: { name: string }) => p.name)).toEqual(['Ana', 'Bruno']);
      expect(response.body.meta).toEqual({ page: 1, perPage: 20, total: 2, totalPages: 1 });
    });

    it('busca por nome ignorando caixa', async () => {
      await seedPatient(ownerId, 'Pedro Álvares');
      await seedPatient(ownerId, 'Eduardo Silva');

      const response = await asOwner('get', '/api/patients?search=PEDRO');

      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta.total).toBe(1);
    });

    it('base vazia devolve 200 com lista vazia, nunca 404', async () => {
      const response = await asOwner('get', '/api/patients');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: [],
        meta: { page: 1, perPage: 20, total: 0, totalPages: 0 },
      });
    });

    it('recusa `perPage` acima do teto', async () => {
      const response = await asOwner('get', '/api/patients?perPage=999999');

      expect(response.status).toBe(400);
      expect(response.body.details[0].message).toBe('O máximo por página é 100.');
    });

    it.each([['page=0'], ['page=-1']])('recusa %s', async (query) => {
      const response = await asOwner('get', `/api/patients?${query}`);

      expect(response.status).toBe(400);
    });
  });

  describe('INV-04 — o paciente do outro médico', () => {
    it('some do `GET /:id`, com a mesma resposta do inexistente', async () => {
      const alheio = await seedPatient(otherId);

      const doOutro = await asOwner('get', `/api/patients/${alheio.id}`);
      const inexistente = await asOwner(
        'get',
        '/api/patients/00000000-0000-4000-8000-000000000000',
      );

      expect(doOutro.status).toBe(404);
      expect(doOutro.body).toEqual({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
      // Byte a byte: 403 — ou qualquer diferença — confirmaria que o id existe.
      expect(doOutro.body).toEqual(inexistente.body);
    });

    it('não pode ser editado, e a linha alheia não muda', async () => {
      const alheio = await seedPatient(otherId, 'Paciente do Outro');

      const response = await asOwner('patch', `/api/patients/${alheio.id}`).send({
        name: 'Invadido',
      });

      expect(response.status).toBe(404);
      const noBanco = await dataSource.getRepository(Patient).findOneByOrFail({ id: alheio.id });
      expect(noBanco.name).toBe('Paciente do Outro');
    });

    it('não pode ser anonimizado, e continua ativo', async () => {
      const alheio = await seedPatient(otherId);

      const response = await asOwner('delete', `/api/patients/${alheio.id}`);

      expect(response.status).toBe(404);
      const noBanco = await dataSource.getRepository(Patient).findOneByOrFail({ id: alheio.id });
      expect(noBanco.anonymizedAt).toBeNull();
    });
  });

  describe('PATCH /api/patients/:id', () => {
    it('altera só o campo enviado', async () => {
      const patient = await seedPatient(ownerId);

      const response = await asOwner('patch', `/api/patients/${patient.id}`).send({
        weightKg: 76.5,
      });

      expect(response.status).toBe(200);
      expect(response.body.weightKg).toBe(76.5);
      expect(response.body.name).toBe('Pedro Álvares');
    });

    it('`null` apaga o campo', async () => {
      const patient = await seedPatient(ownerId);

      const response = await asOwner('patch', `/api/patients/${patient.id}`).send({ phone: null });

      expect(response.body.phone).toBeNull();
      expect(response.body.email).toBe('pedro@example.com');
    });

    it('recusa corpo vazio com 400 — não devolve 200 sem efeito', async () => {
      const patient = await seedPatient(ownerId);

      const response = await asOwner('patch', `/api/patients/${patient.id}`).send({});

      expect(response.status).toBe(400);
      expect(response.body.details[0].message).toBe('Informe ao menos um campo para atualizar.');
    });

    it('recusa id malformado com 400, antes de tocar o banco', async () => {
      const response = await asOwner('patch', '/api/patients/nao-e-uuid').send({ name: 'X' });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/patients/:id — anonimização (LGPD)', () => {
    it('apaga a identificação **no banco** e preserva o resto', async () => {
      const patient = await seedPatient(ownerId);

      const response = await asOwner('delete', `/api/patients/${patient.id}`);

      expect(response.status).toBe(204);

      // A prova precisa ser no banco: a resposta 204 não tem corpo para inspecionar.
      const [row] = (await dataSource.query('SELECT * FROM patients WHERE id = $1', [
        patient.id,
      ])) as Record<string, unknown>[];

      expect(row.name).toBe(ANONYMIZED_PATIENT_NAME);
      expect(row.phone).toBeNull();
      expect(row.email).toBeNull();
      expect(row.birth_date).toBeNull();
      expect(row.anonymized_at).not.toBeNull();
      // INV-03: o que não identifica ninguém permanece.
      expect(Number(row.height_m)).toBe(1.68);
      expect(Number(row.weight_kg)).toBe(75);
    });

    it('é idempotente: 204 nas duas e o carimbo não é reescrito', async () => {
      const patient = await seedPatient(ownerId);

      await asOwner('delete', `/api/patients/${patient.id}`);
      const primeiro = await dataSource
        .getRepository(Patient)
        .findOneByOrFail({ id: patient.id });

      const segunda = await asOwner('delete', `/api/patients/${patient.id}`);
      const depois = await dataSource.getRepository(Patient).findOneByOrFail({ id: patient.id });

      expect(segunda.status).toBe(204);
      expect(depois.anonymizedAt).toEqual(primeiro.anonymizedAt);
    });

    it('o anonimizado continua listável e legível, marcado como inativo', async () => {
      const patient = await seedPatient(ownerId);
      await asOwner('delete', `/api/patients/${patient.id}`);

      const detalhe = await asOwner('get', `/api/patients/${patient.id}`);

      expect(detalhe.status).toBe(200);
      expect(detalhe.body.anonymized).toBe(true);
      expect(detalhe.body.name).toBe(ANONYMIZED_PATIENT_NAME);
    });

    // INV-02.
    it('recusa edição depois de anonimizado, com 422', async () => {
      const patient = await seedPatient(ownerId);
      await asOwner('delete', `/api/patients/${patient.id}`);

      const response = await asOwner('patch', `/api/patients/${patient.id}`).send({
        name: 'Reidentificado',
      });

      expect(response.status).toBe(422);
      expect(response.body).toEqual({
        statusCode: 422,
        code: 'BUSINESS_RULE_VIOLATION',
        message: 'Paciente anonimizado (LGPD) não pode ser editado.',
      });
    });
  });

  describe('sem autenticação', () => {
    it.each([
      ['get', '/api/patients'],
      ['post', '/api/patients'],
      ['get', '/api/patients/00000000-0000-4000-8000-000000000000'],
      ['patch', '/api/patients/00000000-0000-4000-8000-000000000000'],
      ['delete', '/api/patients/00000000-0000-4000-8000-000000000000'],
    ])('%s %s responde 401', async (method, path) => {
      const response = await request(app.getHttpServer())[
        method as 'get' | 'post' | 'patch' | 'delete'
      ](path);

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHENTICATED');
    });
  });
});
