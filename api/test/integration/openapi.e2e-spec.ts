import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { setupSwagger } from '@/swagger.setup';

import { ProbeController } from '../factories/probe.controller';

interface OpenApiMediaType {
  example?: unknown;
  examples?: Record<string, unknown>;
  schema?: { example?: unknown };
}

interface OpenApiResponse {
  description?: string;
  content?: Record<string, OpenApiMediaType>;
}

interface OpenApiOperation {
  summary?: string;
  /** Presente quando a operação exige o bearer — é o que o `@ApiBearerAuth()` publica. */
  security?: unknown[];
  responses?: Record<string, OpenApiResponse>;
}

interface OpenApiDocument {
  info: { title: string; version: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: {
    schemas: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
    securitySchemes: Record<string, { type: string; scheme: string }>;
  };
}

/**
 * As operações do documento da **aplicação** — 17, uma por rota do `PLAN.md §9.1`.
 *
 * A contagem é asserção de propósito (sprint 05.01, decisão 4): rota nova entra por
 * aqui e o teste fica vermelho, obrigando quem a escreveu a olhar a anotação em vez
 * de descobrir a lacuna no `/api/docs` durante a avaliação.
 */
const EXPECTED_OPERATION_COUNT = 17;

/** Os verbos que contam como operação — o resto de um Path Item é metadado. */
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

/**
 * `true` se a resposta publica **algum** exemplo, nas duas formas que o projeto usa:
 * `schema.example` (o caso comum) e `examples` nomeados dentro do media type — a
 * forma que o 422 de `update-appointment` precisa para mostrar dois textos
 * diferentes no mesmo status.
 *
 * Aceitar só uma das duas reprovaria uma rota bem documentada, e a saída fácil
 * seria abrir exceção no gate.
 */
function hasExample(response: OpenApiResponse): boolean {
  return Object.values(response.content ?? {}).some(
    (media) =>
      media.example !== undefined ||
      Object.keys(media.examples ?? {}).length > 0 ||
      media.schema?.example !== undefined,
  );
}

function listOperations(document: OpenApiDocument): [string, OpenApiOperation][] {
  return Object.entries(document.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem)
      .filter(([method]) => HTTP_METHODS.includes(method))
      .map(([method, operation]): [string, OpenApiOperation] => [
        `${method.toUpperCase()} ${path}`,
        operation,
      ]),
  );
}

/**
 * O `main.ts` é o único lugar que chama `setupSwagger` em produção — configuração
 * exercitada só pelo bootstrap não é exercitada por ninguém. Aqui ela roda de
 * verdade.
 *
 * **`AppModule` puro, sem a sonda** (sprint 05.01, decisão 5): o `ProbeController`
 * é fixture de `test/`, tem `summary` e nenhuma resposta com exemplo. Dentro deste
 * describe ele reprovaria uma rota que não existe na API, e a saída fácil seria
 * abrir exceção — gate com exceção é gate sem dente. As asserções que precisam da
 * sonda vivem no describe de baixo, com o próprio documento.
 */
describe('OpenAPI (e2e)', () => {
  let app: INestApplication;
  let document: OpenApiDocument;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

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
      expect.arrayContaining(['/api/health', '/api/auth/login', '/api/patients']),
    );
  });

  it('declara o esquema bearer — o botão Authorize existe antes da primeira rota autenticada', () => {
    expect(Object.values(document.components.securitySchemes)).toContainEqual(
      expect.objectContaining({ type: 'http', scheme: 'bearer' }),
    );
  });

  it('serve a UI em /api/docs', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs');

    expect(response.status).toBe(200);
    expect(response.text).toContain('swagger');
  });

  describe('gate de documentação', () => {
    it(`publica exatamente ${EXPECTED_OPERATION_COUNT} operações`, () => {
      // A mensagem lista as operações: quando o número muda, o diff já diz qual
      // rota entrou ou saiu, sem ninguém precisar abrir o `/api/docs`.
      expect(listOperations(document).map(([name]) => name).sort()).toHaveLength(
        EXPECTED_OPERATION_COUNT,
      );
    });

    it('toda operação tem summary', () => {
      const semSummary = listOperations(document)
        .filter(([, operation]) => !operation.summary?.trim())
        .map(([name]) => name);

      expect(semSummary).toEqual([]);
    });

    it('toda operação tem ao menos uma resposta com exemplo', () => {
      const semExemplo = listOperations(document)
        .filter(([, operation]) => !Object.values(operation.responses ?? {}).some(hasExample))
        .map(([name]) => name);

      expect(semExemplo).toEqual([]);
    });

    // Os dois erros que nenhuma rota individual documentava até a sprint 05.01, e
    // que por isso são justamente os que somem sem ninguém notar: o 401 de sessão
    // some junto com o `@ApiBearerAuth` de uma rota, e o 400 some quando alguém
    // troca o decorator por um bloco inline que esqueceu o `code`.
    it('toda operação autenticada documenta o 401 de sessão', () => {
      const semQuatrocentoEUm = listOperations(document)
        .filter(([, operation]) => operation.security !== undefined)
        .filter(([, operation]) => !operation.responses?.['401'])
        .map(([name]) => name);

      expect(semQuatrocentoEUm).toEqual([]);
    });
  });
});

/**
 * A sonda vive fora do gate porque é fixture, mas o que ela prova continua
 * indispensável: sem `patchNestJsSwagger()`, o schema do DTO sairia **vazio** e o
 * Swagger mentiria sem quebrar nada. É o único risco técnico da configuração, e ele
 * precisa de um DTO cujo schema seja conhecido letra por letra.
 */
describe('OpenAPI — schema derivado do Zod (sonda)', () => {
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

  it('deriva o schema do DTO Zod, com formato e obrigatoriedade, sem @ApiProperty', () => {
    const probe = document.components.schemas.ProbeDto;

    expect(probe.properties).toMatchObject({
      email: { type: 'string', format: 'email' },
      age: { type: 'integer' },
    });
    expect(probe.required).toEqual(expect.arrayContaining(['email', 'age']));
  });

  it('registra a rota da sonda — o documento monta com controller de teste junto', () => {
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining(['/api/probe']));
  });
});
