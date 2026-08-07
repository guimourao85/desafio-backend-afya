import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { EnvironmentService } from '@/shared/environments/environment.service';

/**
 * Prova a decisão 10 da sprint 01.02: sob `NODE_ENV=test` — que o Jest impõe — o
 * provider seleciona `POSTGRES_DB_TEST`. Sem esta asserção, um e2e de F2 que
 * escrevesse no banco de desenvolvimento passaria verde enquanto destrói o seed de
 * demonstração, e ninguém saberia até o roteiro de F7.
 */
describe('Conexão de banco (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let environment: EnvironmentService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    dataSource = app.get<DataSource>(PRONTOMED_POSTGRES_DATA_SOURCE);
    environment = app.get(EnvironmentService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sobe já conectado — o boot falha rápido se o banco não responder', () => {
    expect(dataSource.isInitialized).toBe(true);
  });

  it('está conectado ao banco de teste, não ao de desenvolvimento', async () => {
    const [{ current_database: connected }] = (await dataSource.query(
      'SELECT current_database()',
    )) as { current_database: string }[];

    expect(environment.nodeEnv).toBe('test');
    expect(connected).toBe(environment.get('POSTGRES_DB_TEST'));
    expect(connected).not.toBe(environment.get('POSTGRES_DB'));
  });

  it('não sincroniza schema e não roda migration no boot', () => {
    expect(dataSource.options.synchronize).toBe(false);
    expect(dataSource.options.migrationsRun).toBe(false);
    expect(dataSource.options.migrationsTableName).toBe('typeorm_migrations');
  });
});
