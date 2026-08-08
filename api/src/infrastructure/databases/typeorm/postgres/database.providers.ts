import { join } from 'node:path';

import { DataSource } from 'typeorm';

import entities from '@/domains/domain/model-entities';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { EnvironmentService } from '@/shared/environments/environment.service';

/**
 * O `DataSource` da aplicação. Diferente do datasource do CLI em dois pontos que
 * importam: a configuração vem do `EnvironmentService` (já validada no boot) e a
 * instância é entregue pelo container, sob o token — nunca por um acessor global.
 */
export const databaseProviders = [
  {
    provide: PRONTOMED_POSTGRES_DATA_SOURCE,
    inject: [EnvironmentService],
    useFactory: async (environment: EnvironmentService): Promise<DataSource> => {
      // O e2e sobe o `AppModule` inteiro; sem esta seleção ele escreveria no banco
      // de desenvolvimento e destruiria o seed de demonstração de F6.
      const database =
        environment.nodeEnv === 'test'
          ? environment.get('POSTGRES_DB_TEST')
          : environment.get('POSTGRES_DB');

      const dataSource = new DataSource({
        type: 'postgres',
        host: environment.get('POSTGRES_HOST'),
        port: environment.get('POSTGRES_PORT'),
        username: environment.get('POSTGRES_USER'),
        password: environment.get('POSTGRES_PASSWORD'),
        database,
        entities: [...entities],
        // Simetria com o CLI (que é quem gera o SQL): as duas configurações
        // divergentes seriam duas verdades sobre o mesmo schema.
        uuidExtension: 'pgcrypto',
        // Configuração mantida por simetria com o CLI. Nunca execute runMigrations()
        // a partir deste DataSource.
        migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
        migrationsTableName: 'typeorm_migrations',
        synchronize: false,
        // Migration roda por comando, nunca no boot (review-database.md §regras,
        // item 5): schema não muda porque alguém reiniciou o processo.
        migrationsRun: false,
        logging: false,
      });

      // Fail-fast, mesma doutrina do schema de ambiente: morrer no start com erro
      // legível vale mais do que responder 500 na primeira requisição.
      await dataSource.initialize();

      return dataSource;
    },
  },
];
