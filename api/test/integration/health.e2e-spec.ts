import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health devolve 200 com { status: "ok" }', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  // Detector do prefixo global. A partir de 02.01 vira também o detector do
  // `APP_GUARD`: quando o guard global entrar, o teste acima cai de 200 para 401
  // se o health não receber `@Public()`.
  it('GET /health (sem o prefixo global) devolve 404', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
