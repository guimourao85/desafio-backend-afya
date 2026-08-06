import { validateEnvironment } from './environment';

const VALID_ENV = {
  NODE_ENV: 'test',
  APP_ENV: 'dev',
  PORT: '3333',
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: '5433',
  POSTGRES_USER: 'prontomed',
  POSTGRES_PASSWORD: 'prontomed',
  POSTGRES_DB: 'prontomed',
  POSTGRES_DB_TEST: 'prontomed_test',
  JWT_SECRET: 'a'.repeat(32),
  JWT_ACCESS_TTL: '15m',
  REFRESH_TOKEN_TTL_HOURS: '8',
  BCRYPT_ROUNDS: '10',
  SEED_DOCTOR_EMAIL: 'medico@prontomed.dev',
  SEED_DOCTOR_PASSWORD: 'prontomed123',
};

describe('validateEnvironment', () => {
  it('devolve os valores já convertidos para os tipos do domínio de config', () => {
    const environment = validateEnvironment(VALID_ENV);

    // O que chega de `process.env` é string; o que sai daqui não é (edge case 8).
    expect(environment.PORT).toBe(3333);
    expect(environment.POSTGRES_PORT).toBe(5433);
    expect(environment.REFRESH_TOKEN_TTL_HOURS).toBe(8);
    expect(environment.BCRYPT_ROUNDS).toBe(10);
  });

  // Regressão dos issues 13 e 16: NODE_ENV e APP_ENV são eixos distintos e nenhum
  // dos dois pode absorver o outro.
  it('aceita os literais do ecossistema em NODE_ENV, incluindo o `test` que o Jest impõe', () => {
    for (const nodeEnv of ['development', 'test', 'production'] as const) {
      expect(validateEnvironment({ ...VALID_ENV, NODE_ENV: nodeEnv }).NODE_ENV).toBe(nodeEnv);
    }
  });

  it('aceita os três ambientes do projeto em APP_ENV', () => {
    for (const appEnv of ['dev', 'hmg', 'prod'] as const) {
      expect(validateEnvironment({ ...VALID_ENV, APP_ENV: appEnv }).APP_ENV).toBe(appEnv);
    }
  });

  it('não confunde os dois eixos: `dev` não é NODE_ENV, `development` não é APP_ENV', () => {
    expect(() => validateEnvironment({ ...VALID_ENV, NODE_ENV: 'dev' })).toThrow(/NODE_ENV/);
    expect(() => validateEnvironment({ ...VALID_ENV, APP_ENV: 'development' })).toThrow(/APP_ENV/);
  });

  it('recusa variável obrigatória ausente, nomeando o campo (edge case 1)', () => {
    const { POSTGRES_USER: _omitted, ...incomplete } = VALID_ENV;

    expect(() => validateEnvironment(incomplete)).toThrow(/POSTGRES_USER/);
  });

  it('recusa JWT_SECRET com menos de 32 caracteres (edge case 2)', () => {
    expect(() => validateEnvironment({ ...VALID_ENV, JWT_SECRET: 'curto' })).toThrow(/JWT_SECRET/);
  });

  it('não imprime o valor da variável na mensagem de erro, só o campo', () => {
    const secret = 'segredo-que-nao-pode-vazar';

    expect(() => validateEnvironment({ ...VALID_ENV, JWT_SECRET: secret })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    );
  });
});
