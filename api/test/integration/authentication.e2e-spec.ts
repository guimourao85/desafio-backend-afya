import { createHash } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { Doctor } from '@/domains/domain/model-entities/doctor.entity';
import { RefreshToken } from '@/domains/domain/model-entities/refresh-token.entity';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { PasswordHasher } from '@/shared/interfaces/cryptography/password-hasher';

const DOCTOR_EMAIL = 'e2e.autenticacao@prontomed.dev';
const DOCTOR_PASSWORD = 'senha-de-teste-123';

/**
 * O login ponta a ponta, contra o Postgres de verdade. É aqui — e só aqui — que
 * INV-06 e a foreign key deixam de ser intenção e viram fato observável: o unitário
 * prova o comportamento do caso de uso, mas não prova o que o **banco** guardou.
 */
describe('Autenticação (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let doctorId: string;
  let passwordHash: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    // O mesmo `configureApp` do `main.ts`: sem ele o teste validaria um contrato
    // HTTP que não é o da aplicação — sem prefixo `/api` e sem envelope de erro.
    configureApp(app);
    await app.init();

    dataSource = app.get<DataSource>(PRONTOMED_POSTGRES_DATA_SOURCE);

    // O hash sai do **mesmo** hasher do login — um bcrypt solto aqui testaria o
    // teste, não a aplicação. Calculado uma vez só: o valor é imutável, e repetir
    // bcrypt a cada caso custaria ~80 ms para provar nada.
    passwordHash = await app.get(PasswordHasher).hash(DOCTOR_PASSWORD);
  });

  afterAll(async () => {
    // Deixa o banco de teste como encontrou: suíte que suja o schema faz a próxima
    // passar ou falhar por motivo alheio a ela.
    await dataSource.query('TRUNCATE TABLE refresh_tokens, doctors');
    await app.close();
  });

  beforeEach(async () => {
    // Estado recriado do zero a cada caso, médico incluído. Criá-lo uma vez no
    // `beforeAll` funcionaria hoje e viraria acoplamento oculto no dia em que um
    // caso alterasse a linha — `review-testing.md §regras` proíbe compartilhar
    // registro entre testes, e a proibição não depende de o dano já ter ocorrido.
    //
    // `TRUNCATE` e não `delete({})`, que o TypeORM recusa por critério vazio. As
    // duas tabelas na mesma instrução: separadas, a FK barraria a primeira.
    await dataSource.query('TRUNCATE TABLE refresh_tokens, doctors');

    const inserted = await dataSource.getRepository(Doctor).insert({
      name: 'Médica de Teste',
      email: DOCTOR_EMAIL,
      passwordHash,
    });

    doctorId = inserted.identifiers[0].id as string;
  });

  describe('POST /api/auth/login — credencial válida', () => {
    it('responde 200 (não 201: login não cria recurso) com a sessão completa', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        // 900 = os 15 minutos de `JWT_ACCESS_TTL`, derivados do próprio token.
        expiresIn: 900,
      });
    });

    it('aceita o email com caixa e espaço diferentes — a borda normaliza', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: `  ${DOCTOR_EMAIL.toUpperCase()}  `, password: DOCTOR_PASSWORD });

      expect(response.status).toBe(200);
    });

    // INV-06 — a prova que exige ir ao banco.
    it('grava no banco apenas o SHA-256 do refresh; o valor em claro não está em lugar nenhum', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD });

      const plainRefreshToken = response.body.refreshToken as string;
      const expectedHash = createHash('sha256').update(plainRefreshToken).digest('hex');

      const rows = (await dataSource.query('SELECT * FROM refresh_tokens')) as Record<
        string,
        unknown
      >[];

      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).toBe(expectedHash);
      expect(rows[0].doctor_id).toBe(doctorId);
      expect(rows[0].revoked_at).toBeNull();

      // Varredura da linha inteira: o token cru não aparece em coluna nenhuma.
      expect(JSON.stringify(rows[0])).not.toContain(plainRefreshToken);
    });

    // INV-07.
    it('não devolve `password_hash` nem `token_hash` na resposta', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD });

      expect(Object.keys(response.body).sort()).toEqual([
        'accessToken',
        'expiresIn',
        'refreshToken',
      ]);

      const serialized = JSON.stringify(response.body);

      expect(serialized).not.toContain('password_hash');
      expect(serialized).not.toContain('token_hash');
      expect(serialized).not.toContain(DOCTOR_PASSWORD);
    });

    it('emite um access token que carrega o id do médico em `sub`', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD });

      const [, payload] = (response.body.accessToken as string).split('.');
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
        sub: string;
        exp: number;
        iat: number;
      };

      expect(claims.sub).toBe(doctorId);
      expect(claims.exp - claims.iat).toBe(900);
    });
  });

  describe('POST /api/auth/login — credencial inválida', () => {
    it('responde igual para senha errada e para email inexistente', async () => {
      const comSenhaErrada = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: DOCTOR_EMAIL, password: 'senha-que-nao-e-a-dela' });

      const comEmailInexistente = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'ninguem@prontomed.dev', password: DOCTOR_PASSWORD });

      expect(comSenhaErrada.status).toBe(401);
      expect(comSenhaErrada.body).toEqual({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Email ou senha incorretos.',
      });
      // Byte a byte: qualquer diferença aqui é um oráculo de "esta pessoa tem conta".
      expect(comEmailInexistente.body).toEqual(comSenhaErrada.body);
    });

    it('não abre sessão nenhuma quando a credencial falha', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: DOCTOR_EMAIL, password: 'senha-errada' });

      expect(await dataSource.getRepository(RefreshToken).count()).toBe(0);
    });
  });

  describe('POST /api/auth/login — payload malformado', () => {
    it.each([
      ['sem `password`', { email: DOCTOR_EMAIL }],
      ['sem `email`', { password: DOCTOR_PASSWORD }],
      ['com email inválido', { email: 'nao-e-email', password: DOCTOR_PASSWORD }],
      ['com campo extra', { email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD, admin: true }],
    ])('responde 400 com `details[]` quando o corpo vem %s', async (_caso, body) => {
      const response = await request(app.getHttpServer()).post('/api/auth/login').send(body);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(response.body.details)).toBe(true);
      expect(response.body.details.length).toBeGreaterThan(0);
    });
  });

  describe('integridade no banco', () => {
    // Edge case 6: prova que a FK acrescentada à mão na revisão da migration está
    // mesmo lá. Sem esta asserção, apagá-la da migration não quebraria teste nenhum.
    it('recusa refresh token apontando para um médico inexistente', async () => {
      const orfao = dataSource.getRepository(RefreshToken).create({
        doctorId: '00000000-0000-0000-0000-000000000000',
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        revokedAt: null,
      });

      await expect(dataSource.getRepository(RefreshToken).insert(orfao)).rejects.toThrow(
        /fk_refresh_tokens_doctors/,
      );
    });
  });
});
