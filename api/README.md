# Arquitetura do backend

Documento **técnico**: camadas, injeção de dependência, contrato de erro,
persistência e o que o lint garante. Como subir o projeto está no
[README da raiz](../README.md); requisitos, agregados e invariantes estão em
[`docs/PRODUCT.md`](docs/PRODUCT.md); as decisões e suas alternativas, em
[`docs/PLAN.md`](docs/PLAN.md).

> Este arquivo descreve o que **existe** no repositório hoje (F1 + OpenAPI). O que
> ainda não foi construído está marcado como _(F2+)_.

---

## Premissa

**DDD sobre hexagonal, na estrutura de pastas do NestJS.** Duas ideias, com papéis
distintos:

| | O que resolve | Como aparece no código |
| --- | --- | --- |
| **Hexagonal** | Isolar a regra da tecnologia | O service depende de uma **porta** (interface); o `*.provider.ts` entrega o adapter TypeORM _(F2+)_ |
| **DDD** | Definir a unidade de consistência | Agregados se referenciam **por ID**, e uma transação toca um só — a transação vive no adapter, nunca no service |

A injeção de dependência é a do **Nest**: nenhum container próprio, nenhum
service locator. O que não está no `exports` de um módulo não é injetável fora dele —
essa é a fronteira real.

---

## Regra de dependência

```
gateways/http ──▶ domains/domain/services ──▶ repositories (portas)
                                                     ▲
                                     infrastructure (adapters TypeORM)
```

A seta aponta **para dentro**. O núcleo não conhece transporte nem persistência; quem
conhece os dois é a borda.

| Proibição | Onde é enforçada |
| --- | --- |
| `services/**` importar `typeorm`, `@nestjs/typeorm`, `express`, `pg`, `bcryptjs`, `@nestjs/jwt`, `crypto` | ESLint (`no-restricted-imports`) |
| `services/**` importar `infrastructure/**` ou `gateways/**` | ESLint |
| `controllers/**` importar `typeorm` ou `infrastructure/**` | ESLint |
| Um módulo de domínio injetar o token de repositório de outro | review `[Backend]` |
| Service orquestrar transação, ou receber `Request`/`Response` | review `[Backend]` |

`model-entities/**` **pode** importar `typeorm`: a entity é a do ORM, por decisão
(ADR-03) — não há mapeamento domínio ⇄ persistência. A linha protegida é o **service**.

Para conferir que a regra está viva, e não apenas escrita:

```bash
mkdir -p src/domains/domain/services/_probe
printf "import { DataSource } from 'typeorm';\nexport const p = (d: DataSource) => d;\n" \
  > src/domains/domain/services/_probe/probe.ts
npx eslint src/domains/domain/services/_probe/probe.ts   # deve REPROVAR
rm -rf src/domains/domain/services/_probe
```

---

## Estrutura

```
src/
├─ main.ts                    NestFactory · configureApp · setupSwagger · listen
├─ app.setup.ts               configureApp(): prefixo global + filtro de exceções
├─ swagger.setup.ts           setupSwagger(): patchNestJsSwagger · DocumentBuilder
├─ app.module.ts              ConfigModule(validate) · EnvironmentModule · DatabaseModule · HttpModule
│
├─ domains/domain/            O NÚCLEO — sem framework de transporte, sem ORM
│  ├─ model-entities/         entities + barril `index.ts` que os DataSource consomem
│  ├─ repositories/           PORTAS (interfaces)                            (F2+)
│  ├─ enums/                                                                 (F2+)
│  └─ services/               casos de uso + `*.module.ts` + `*.provider.ts`  (F2+)
│
├─ gateways/http/             A BORDA DE ENTRADA
│  ├─ http.module.ts          controllers + APP_PIPE (+ APP_GUARD em F2)
│  ├─ controllers/core/       health
│  ├─ controllers/domain/                                                    (F2+)
│  ├─ schemas/domain/         schemas Zod + DTOs via createZodDto            (F2+)
│  └─ pipes/                  zod-validation-pipe.ts
│
├─ framework/                 PLUMBING do Nest
│  ├─ filters/errors/         exception-filter.ts
│  ├─ authentication/         guard, decorators                              (F2+)
│  └─ cryptography/           adapters de PasswordHasher / TokenIssuer        (F2+)
│
├─ infrastructure/databases/typeorm/postgres/
│  ├─ typeorm-database.datasource.ts   o DataSource do CLI
│  ├─ database.providers.ts            o DataSource da aplicação
│  ├─ database.module.ts               @Global + shutdown da conexão
│  ├─ migrations/                      linha do tempo única                  (F2+)
│  ├─ repositories/                    adapters que implementam as portas    (F2+)
│  └─ seeds/                                                                 (F6)
│
├─ presentation/presenters/   serialização de saída                          (F2+)
└─ shared/
   ├─ constants/              tokens de DI
   ├─ errors/                 either.ts + types/ (DomainError com `code`)
   ├─ interfaces/cryptography/ PORTAS de cripto                              (F2+)
   └─ environments/           schema Zod do ambiente + EnvironmentService
```

---

## Composição da aplicação

Três funções, com escopos deliberadamente diferentes:

| Onde | O que registra | Quem usa |
| --- | --- | --- |
| `configureApp()` | prefixo global `api` + `AllExceptionsFilter` | `main.ts` **e** todo e2e |
| `setupSwagger()` | OpenAPI em `/api/docs` | só `main.ts` e o e2e de OpenAPI |
| `bootstrap()` | compõe as duas e faz `listen` | processo |

`configureApp` existe separada porque **configuração que só o `main.ts` executa não é
exercitada por ninguém**: enquanto cada teste repetia `setGlobalPrefix` +
`useGlobalFilters` por conta própria, remover o filtro do bootstrap deixava a suíte
inteira verde. `setupSwagger` fica de fora dela pelo motivo oposto — montar o
documento OpenAPI é custo que nenhuma suíte deveria pagar para responder a uma
requisição.

---

## Contrato de erro

Três peças em sequência: o service devolve, o filtro traduz, o cliente lê.

**1. `Either` (`shared/errors/either.ts`)** — o erro esperado faz parte da assinatura:

```ts
const result = await this.service.execute(input);
if (result.isLeft()) throw result.value;   // o filtro traduz pelo `code`
return Presenter.toHTTP(result.value);
```

`throw` fica reservado ao que é **defeito**. Erro esperado que sobe como exceção some
da assinatura, e quem chama deixa de ser obrigado a tratá-lo.

**2. `DomainError` (`shared/errors/types/`)** — abstrata, com `code` de **tipo
fechado**:

```ts
export type DomainErrorCode = 'INVALID_CREDENTIALS' | 'UNAUTHENTICATED' | /* … */;
```

O tipo fechado é o que faz o compilador cobrar o mapeamento no filtro: um `code` novo
sem status vira erro de build — `TS2741 Property … is missing in Record<DomainErrorCode, number>` —
em vez de um 500 em produção.

**3. `AllExceptionsFilter` (`framework/filters/errors/`)** — `@Catch()` sem argumento,
cinco ramos em **ordem significativa**:

| # | Entrada | Saída |
| --- | --- | --- |
| 1 | `ZodValidationException` | 400 `VALIDATION_ERROR` + `details[]` |
| 2 | `DomainError` | status do catálogo, `code` e mensagem da própria classe |
| 3 | `QueryFailedError` com `23505` | 409 com mensagem humana; texto do driver só no log |
| 4 | `HttpException` do Nest | status dele, `code` derivado, mensagem PT-BR |
| 5 | qualquer outra coisa | 500 genérico, stack só no `Logger.error` |

A ordem não é estética: `ZodValidationException` **é** uma `HttpException`, e se o
ramo 4 viesse antes, todo payload inválido responderia um 400 opaco, sem `details[]`.

Envelope único, `details` exclusivo do 400:

```jsonc
{ "statusCode": 409, "code": "SCHEDULE_CONFLICT", "message": "…", "details": [ … ] }
```

Nenhuma resposta carrega SQL, nome de constraint ou stack — há asserção de teste para
cada um desses três.

---

## Validação

`ZodValidationPipe` registrado como **`APP_PIPE`**, global. Deriva o schema do DTO da
própria rota:

```ts
export const scheduleSchema = z.object({ /* … */ }).strict();
export class ScheduleDto extends createZodDto(scheduleSchema) {}
```

Global por decisão: validação opcional é validação ausente. O `.strict()` faz campo
desconhecido virar erro em vez de silêncio. E o mesmo schema alimenta o OpenAPI via
`patchNestJsSwagger()` — uma fonte para validação e documentação, sem `@ApiProperty`
duplicando o que o Zod já declara.

Três camadas, propósitos distintos: **borda** ("tem forma de payload?" → 400) ·
**domínio** ("é legítimo agora?" → 422/409) · **banco** ("e se dois pedidos chegarem
juntos?" → 409 de constraint).

---

## Persistência

**Dois `DataSource`, por obrigação e não por gosto:**

| Arquivo | Quem consome | Config vem de |
| --- | --- | --- |
| `typeorm-database.datasource.ts` | o CLI do TypeORM (`-d` dos scripts) | `process.env` cru — o CLI roda fora do Nest, logo sem DI |
| `database.providers.ts` | a aplicação | `EnvironmentService`, já validado no boot |

Detalhes que não são óbvios ao ler:

- **O DataSource do CLI importa o barril de entities por caminho relativo**, nunca por
  `@/`. `typeorm-ts-node-commonjs` não registra `tsconfig-paths`, e o alias faria
  `migration:generate` morrer em `Cannot find module`.
- **`migrations` aponta para `join(__dirname, …)`**, relativo ao arquivo — funciona de
  qualquer cwd e depois do build, quando os `.js` estão em `dist/`.
- **`NODE_ENV=test` seleciona `POSTGRES_DB_TEST`** nos dois. É o que impede o e2e de
  escrever no banco de desenvolvimento. Os scripts `test:e2e` e `migration:run:test`
  declaram a variável explicitamente, em vez de depender de o Jest injetá-la.
- **`synchronize: false` e `migrationsRun: false`**, explícitos: schema muda por
  comando revisado, nunca porque alguém reiniciou o processo.
- **`DatabaseModule` implementa `OnModuleDestroy`.** O `DataSource` vem de
  `useFactory`, então o Nest sabe construí-lo mas não sabe que `destroy()` é o fim
  dele — sem o hook, o pool sobrevive ao `app.close()`.
- **`initialize()` no `useFactory`**: banco fora do ar mata o processo no start com
  erro legível, em vez de responder 500 na primeira requisição.

Migrations são **geradas** (`migration:generate`), **revisadas** e **forward-only** —
migration aplicada nunca é editada; a correção é uma migration nova.

---

## Testes

| Camada | Monta | Prova | Onde |
| --- | --- | --- | --- |
| **Unitário** | `TestingModule` com a porta sobrescrita por um in-memory | regra pura, sem banco | `*.spec.ts` ao lado do alvo |
| **Integração** | `AppModule` inteiro + Supertest + Postgres real | rota → service → banco, incluindo constraints | `test/integration/*.e2e-spec.ts` |

Se um teste unitário precisar mockar `DataSource` ou o repositório concreto, isso é
vazamento de arquitetura — conserta-se o código, não o teste.

`test/factories/probe.controller.ts` é uma sonda: até F2 nenhuma rota de produção
recebe corpo, e sem uma que receba não há como exercitar o `APP_PIPE` global nem a
derivação Zod → OpenAPI. Ela vive em `test/`, fora do alcance do `nest build`.

---

## Convenções

| Item | Regra |
| --- | --- |
| Idioma | Código, arquivos e banco em **inglês**; mensagem ao cliente da API em **PT-BR** |
| Arquivo | `kebab-case` com sufixo de papel: `schedule-appointment.service.ts` |
| Classe | `PascalCase`; porta **sem** prefixo `I` |
| Service | um método público `execute`, verbo no infinitivo |
| Banco | `snake_case`, tabela no plural, constraints `pk_` `fk_` `uk_` `idx_` `ck_` |
| Teste | `*.spec.ts` ao lado do alvo; e2e em `test/integration/` |
| Import | alias `@/` para `src/` — exceto no DataSource do CLI, que o CLI não resolve |
