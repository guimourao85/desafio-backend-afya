import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';

import { ProbeController } from '../factories/probe.controller';

describe('Envelope de erro (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      // A sonda dá um corpo simples e estável para provar o contrato de erro sem
      // depender de uma rota de produção. O `APP_PIPE` que ela exercita é o global
      // de verdade.
      controllers: [ProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    // A mesma configuração que o `main.ts` aplica — não uma reprodução dela.
    configureApp(app);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rota inexistente devolve o envelope padrão, com `code` e mensagem em PT-BR', async () => {
    const response = await request(app.getHttpServer()).get('/api/nao-existe');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Recurso não encontrado.',
    });
    // O que o Nest devolveria sozinho — e que ADR-13 proíbe.
    expect(JSON.stringify(response.body)).not.toContain('Cannot GET');
  });

  it('payload inválido morre na borda com 400 e a lista de campos', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/probe')
      .send({ email: 'não-é-email', age: -1 });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Requisição inválida.',
    });
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        { path: 'email', message: expect.any(String) },
        { path: 'age', message: expect.any(String) },
      ]),
    );
  });

  it('campo desconhecido é erro, não silêncio (`.strict()`)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/probe')
      .send({ email: 'medico@prontomed.dev', age: 40, doctorId: 'tentativa-de-injecao' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('payload válido atravessa o pipe global e chega tipado ao controller', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/probe')
      .send({ email: 'medico@prontomed.dev', age: 40 });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ email: 'medico@prontomed.dev', age: 40 });
  });

  it('`details` não aparece fora do 400', async () => {
    const response = await request(app.getHttpServer()).get('/api/nao-existe');

    expect(response.body).not.toHaveProperty('details');
  });
});
