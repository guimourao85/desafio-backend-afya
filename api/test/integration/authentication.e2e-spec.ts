import { createHash } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { Doctor } from '@/domains/domain/model-entities/doctor.entity';
import { RefreshToken } from '@/domains/domain/model-entities/refresh-token.entity';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { PasswordHasher } from '@/shared/interfaces/cryptography/password-hasher';

import { truncateAll } from '../factories/truncate-all';

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
    await truncateAll(dataSource);
    await app.close();
  });

  beforeEach(async () => {
    // Estado recriado do zero a cada caso, médico incluído. Criá-lo uma vez no
    // `beforeAll` funcionaria hoje e viraria acoplamento oculto no dia em que um
    // caso alterasse a linha — `review-testing.md §regras` proíbe compartilhar
    // registro entre testes, e a proibição não depende de o dano já ter ocorrido.
    //
    // `truncateAll` e não `delete({})`, que o TypeORM recusa por critério vazio.
    // A lista de tabelas vive num lugar só: quando `patients` nasceu, esta suíte
    // quebrou inteira por FK — e ela não tem nada a ver com pacientes.
    await truncateAll(dataSource);

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
    // Prova que a FK acrescentada à mão na revisão da migration está mesmo lá — sem
    // esta asserção, apagá-la da migration não quebraria teste nenhum.
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

  /** Abre uma sessão de verdade — é o insumo de todo teste que depende de sessão autenticada. */
  async function login(): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD });

    return response.body as { accessToken: string; refreshToken: string };
  }

  describe('POST /api/auth/refresh', () => {
    it('devolve um novo access token e **não** repete o refresh no corpo', async () => {
      const { refreshToken } = await login();

      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      // Igualdade de chaves: sem rotação, devolver o refresh sugeriria que ele mudou.
      expect(Object.keys(response.body).sort()).toEqual(['accessToken', 'expiresIn']);
      expect(response.body.expiresIn).toBe(900);
    });

    it('o access renovado abre uma rota protegida', async () => {
      const { refreshToken } = await login();

      const renovado = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken });

      const perfil = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${renovado.body.accessToken}`);

      expect(perfil.status).toBe(200);
      expect(perfil.body.id).toBe(doctorId);
    });

    it('não rotaciona: duas renovações concorrentes devolvem dois access válidos', async () => {
      const { refreshToken } = await login();

      const [primeira, segunda] = await Promise.all([
        request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken }),
        request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken }),
      ]);

      expect([primeira.status, segunda.status]).toEqual([200, 200]);
      // A sessão continua uma só, viva: nada foi criado nem revogado.
      expect(await dataSource.getRepository(RefreshToken).count()).toBe(1);
    });

    it('responde igual para refresh desconhecido, revogado e expirado', async () => {
      const { refreshToken: revogado } = await login();
      await request(app.getHttpServer()).post('/api/auth/logout').send({ refreshToken: revogado });

      // Expirado: a linha nasce com data no passado. Fake timer não serve — quem
      // compara é o `now()` do Postgres, não o relógio deste processo.
      const expirado = 'refresh-expirado-de-teste';
      await dataSource.getRepository(RefreshToken).insert({
        doctorId,
        tokenHash: createHash('sha256').update(expirado).digest('hex'),
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
        revokedAt: null,
      });

      const respostas = await Promise.all(
        [revogado, expirado, 'token-que-nunca-existiu'].map((refreshToken) =>
          request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken }),
        ),
      );

      for (const resposta of respostas) {
        expect(resposta.status).toBe(401);
        expect(resposta.body).toEqual({
          statusCode: 401,
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Sessão expirada. Faça login novamente.',
        });
      }
    });
  });

  describe('POST /api/auth/logout', () => {
    it('responde 204 sem corpo e marca `revoked_at` no banco', async () => {
      const { refreshToken } = await login();

      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .send({ refreshToken });

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});

      const [row] = (await dataSource.query('SELECT revoked_at FROM refresh_tokens')) as {
        revoked_at: Date | null;
      }[];

      expect(row.revoked_at).not.toBeNull();
    });

    it('responde 204 para token desconhecido — logout nunca falha', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .send({ refreshToken: 'token-que-nunca-existiu' });

      expect(response.status).toBe(204);
    });

    it('é idempotente: a segunda chamada responde 204 e não reescreve `revoked_at`', async () => {
      const { refreshToken } = await login();

      await request(app.getHttpServer()).post('/api/auth/logout').send({ refreshToken });
      const [primeira] = (await dataSource.query('SELECT revoked_at FROM refresh_tokens')) as {
        revoked_at: Date;
      }[];

      const segunda = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .send({ refreshToken });
      const [depois] = (await dataSource.query('SELECT revoked_at FROM refresh_tokens')) as {
        revoked_at: Date;
      }[];

      expect(segunda.status).toBe(204);
      // O instante da **primeira** revogação é o que a linha continua contando.
      expect(depois.revoked_at).toEqual(primeira.revoked_at);
    });

    it('responde 400 quando o corpo vem sem `refreshToken` — o 204 é sobre o token, não sobre o payload', async () => {
      const response = await request(app.getHttpServer()).post('/api/auth/logout').send({});

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('não derruba o access corrente: ele segue abrindo rota protegida até expirar', async () => {
      const { accessToken, refreshToken } = await login();

      await request(app.getHttpServer()).post('/api/auth/logout').send({ refreshToken });

      const perfil = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      // Comportamento declarado (DEBT-11), não defeito: o logout impede a
      // renovação, e o access morre sozinho em ≤ 15 min.
      expect(perfil.status).toBe(200);
    });
  });

  describe('GET /api/auth/me', () => {
    it('devolve id, nome e email — e nada mais (INV-07)', async () => {
      const { accessToken } = await login();

      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: doctorId,
        name: 'Médica de Teste',
        email: DOCTOR_EMAIL,
      });
    });

    it.each([
      ['sem header Authorization', undefined],
      ['sem o esquema Bearer', 'apenas-o-token'],
      ['com esquema errado', 'Basic YWJjOjEyMw=='],
      ['com token que não é JWT', 'Bearer nao-e-um-jwt'],
    ])('responde 401 %s', async (_caso, authorization) => {
      const requisicao = request(app.getHttpServer()).get('/api/auth/me');

      if (authorization) requisicao.set('Authorization', authorization);

      const response = await requisicao;

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
        message: 'Autenticação necessária.',
      });
    });

    it('responde 401 para token expirado e para token de outro segredo', async () => {
      const jwtService = app.get(JwtService);

      const expirado = await jwtService.signAsync(
        { sub: doctorId, email: DOCTOR_EMAIL },
        { expiresIn: '-1s' },
      );
      const outroSegredo = await jwtService.signAsync(
        { sub: doctorId, email: DOCTOR_EMAIL },
        { secret: 'um-segredo-que-nao-e-o-desta-api-1234' },
      );

      for (const token of [expirado, outroSegredo]) {
        const response = await request(app.getHttpServer())
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('UNAUTHENTICATED');
      }
    });

    it('responde 401 quando o token é válido mas o médico não existe mais', async () => {
      const { accessToken } = await login();

      await truncateAll(dataSource);

      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      // 401 e não 404: quem sumiu é o dono da sessão, não um recurso de terceiro.
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHENTICATED');
    });
  });
});
