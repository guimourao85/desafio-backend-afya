import { z } from 'zod';

/**
 * O contrato de ambiente inteiro (PLAN.md Apêndice F), validado no boot desde F0 —
 * inclusive o que só F2 e F6 consomem. Custa exigir variável antes da hora; evita
 * três edições futuras deste arquivo e três chances de subir com `undefined`.
 */
export const environmentSchema = z.object({
  // Duas variáveis, de propósito (padrão da referência técnica).
  //
  // NODE_ENV é contrato do ecossistema Node, não nosso: Express e uma pilha de
  // libs ramificam nos literais `production`/`test`, e o Jest injeta `test` em
  // `process.env` — que vence o `.env` no ConfigModule. Renomear os valores aqui
  // desliga esses comportamentos em silêncio e derruba todo e2e.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // APP_ENV é o ambiente do *projeto*, e este é nosso. Na prática só `dev` é
  // construído (ADR-12); `hmg`/`prod` existem para o dia em que houver. É a chave
  // certa para trava fail-closed (ex.: seed de F6 só roda em `dev`).
  // Nome em inglês por ADR-13 — a referência chama de `AMBIENTE`, mas ela é um
  // projeto PT-BR. Os valores ficam como estão: são vocabulário de domínio.
  APP_ENV: z.enum(['dev', 'hmg', 'prod']).default('dev'),

  PORT: z.coerce.number().int().positive().default(3333),

  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_DB_TEST: z.string().min(1),

  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().min(1).default('15m'),
  REFRESH_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(8),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).default(10),

  SEED_DOCTOR_EMAIL: z.string().email(),
  SEED_DOCTOR_PASSWORD: z.string().min(8),
});

export type Environment = z.infer<typeof environmentSchema>;

/**
 * Consumida por `ConfigModule.forRoot({ validate })`: config inválida mata o processo
 * no start, com a lista de campos. A mensagem carrega o **campo**, nunca o valor —
 * um segredo malformado não pode vazar pelo log de boot.
 */
export function validateEnvironment(raw: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(raw);

  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Variáveis de ambiente inválidas:\n${fields}`);
  }

  return result.data;
}
