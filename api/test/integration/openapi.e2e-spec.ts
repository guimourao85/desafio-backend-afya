import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { setupSwagger } from '@/swagger.setup';

import { ProbeController } from '../factories/probe.controller';

interface OpenApiDocument {
  info: { title: string; version: string };
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
    securitySchemes: Record<string, { type: string; scheme: string }>;
  };
}

/**
 * O `main.ts` é o único lugar que chama `setupSwagger` em produção — e a lição do
 * issue 4 da sprint 01.02 foi justamente essa: configuração exercitada só pelo
 * bootstrap não é exercitada por ninguém. Aqui ela roda de verdade, contra a
 * sonda, que é a única rota com corpo até F2.
 */
describe('OpenAPI (e2e)', () => {
  let app: INestApplication;
  let document: OpenApiDocument;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    setupSwagger(app);

    await app.init();

    const response = await request(app.getHttpServer()).get('/api/docs-json');
    document = response.body as OpenApiDocument;
  });

  afterAll(async () => {
    await app.close();
  });

  it('serve o documento em /api/docs-json, com título e versão do plano', () => {
    expect(document.info).toMatchObject({ title: 'ProntoMed API', version: '1.0' });
  });

  it('publica as rotas registradas, já com o prefixo global', () => {
    // O caminho do Swagger é literal e não vira `/api/api/docs`.
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(['/api/health', '/api/probe']),
    );
  });

  it('declara o esquema bearer — o botão Authorize existe antes da primeira rota autenticada', () => {
    expect(Object.values(document.components.securitySchemes)).toContainEqual(
      expect.objectContaining({ type: 'http', scheme: 'bearer' }),
    );
  });

  // O único risco técnico de antecipar F6: sem `patchNestJsSwagger()`, o schema
  // sairia vazio e o Swagger mentiria sem quebrar nada.
  it('deriva o schema do DTO Zod, com formato e obrigatoriedade, sem @ApiProperty', () => {
    const probe = document.components.schemas.ProbeDto;

    expect(probe.properties).toMatchObject({
      email: { type: 'string', format: 'email' },
      age: { type: 'integer' },
    });
    expect(probe.required).toEqual(expect.arrayContaining(['email', 'age']));
  });

  it('serve a UI em /api/docs', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs');

    expect(response.status).toBe(200);
    expect(response.text).toContain('swagger');
  });
});
