import 'dotenv/config';

import { join } from 'node:path';

import { DataSource } from 'typeorm';

// Import RELATIVO por obrigação, não por estilo: `typeorm-ts-node-commonjs` não
// registra `tsconfig-paths`, então `@/` morre em `Cannot find module` na hora do
// `migration:generate`. Exceção declarada à convenção de alias do projeto — e ela
// vale só neste arquivo, que é o único que o CLI carrega.
import entities from '../../../../domains/domain/model-entities';

const port = process.env.POSTGRES_PORT ? Number(process.env.POSTGRES_PORT) : 5432;

// Mesmo eixo que o `database.providers.ts` usa dentro do Nest: `NODE_ENV=test`
// aponta para o banco de teste. Sem isto o `migration:run` só alcançaria o banco
// de desenvolvimento, e o e2e de autenticação — que grava e lê `doctors` — quebraria
// com `relation does not exist`: uma falha diferida, a pior espécie. O script
// `migration:run:test` é quem liga o eixo.
const database =
  process.env.NODE_ENV === 'test' ? process.env.POSTGRES_DB_TEST : process.env.POSTGRES_DB;

/**
 * O `DataSource` do CLI do TypeORM — alvo do `-d` de todo script de migration.
 *
 * Ele existe separado do provider da aplicação porque o CLI roda **fora** do Nest:
 * não há injeção de dependência, logo não há `EnvironmentService`. Aqui, e só
 * aqui, `process.env` é lido cru.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database,
  entities: [...entities],
  // Sem isto o gerador emite `DEFAULT uuid_generate_v4()` e o TypeORM instala a
  // extensão `uuid-ossp` **por fora da migration** — efeito colateral que não está
  // no arquivo revisado e que o `down()` não desfaz. Com a opção, sai
  // `gen_random_uuid()`, que é o DDL de PLAN.md §6.2 e é nativo do PG 13+.
  uuidExtension: 'pgcrypto',
  // Caminho relativo ao ARQUIVO, não ao cwd: funciona de qualquer diretório e
  // continua funcionando depois do build, quando os `.js` estão em `dist/`.
  migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
  migrationsTableName: 'typeorm_migrations',
  // Schema é decidido por migration revisada, nunca inferido da entity.
  synchronize: false,
  migrationsRun: false,
  logging: false,
});
