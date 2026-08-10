# Arquitetura do backend

Documento **técnico** e autoridade sobre **como o backend é construído**: camadas,
injeção de dependência, contrato de erro, validação, persistência, ambiente de execução
e estratégia de teste.

O que **não** mora aqui, e por quê — cada assunto tem um dono só:

| Assunto                                                | Autoridade                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Subir o projeto e avaliá-lo em 10 passos               | [README da raiz](../README.md)                                                |
| Personas, jornadas, agregados, invariantes, ADRs, banco | [`docs/PRODUCT.md`](docs/PRODUCT.md)                                          |
| Requisitos, fases, contratos HTTP, padrões de código   | [`docs/PLAN.md`](docs/PLAN.md)                                                |
| Débitos, com severidade e gatilho de reabertura        | [`docs/DEBITOS-TECNICOS.md`](docs/DEBITOS-TECNICOS.md)                        |
| A prova sob estresse — método, números, condição       | [`test/stress/README.md`](test/stress/README.md)                              |

> Este arquivo descreve o que **existe** no repositório hoje: F0 a F7 construídas
> (autenticação, pacientes, agenda, anotações, Swagger executável, seed, provas sob
> estresse). Estado por sprint em [`docs/PRODUCT.md §roadmap`](docs/PRODUCT.md).

---

## Premissa

**DDD sobre hexagonal, na estrutura de pastas do NestJS.** Duas ideias, com papéis
distintos:

| | O que resolve | Como aparece no código |
| --- | --- | --- |
| **Hexagonal** | Isolar a regra da tecnologia | O service depende de uma **porta** (interface); o `*.provider.ts` entrega o adapter TypeORM |
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
│  ├─ repositories/           PORTAS (interfaces) — doctor, patient, appointment, refresh-token
│  ├─ enums/                  status da consulta, sexo do paciente
│  └─ services/               casos de uso + `*.module.ts` + `*.provider.ts`
│     ├─ authentication/      login, refresh, logout, perfil
│     ├─ patients/            cadastro, listagem, edição, anonimização LGPD
│     └─ appointments/        agenda, cancelamento, anotações, linha do tempo
│
├─ gateways/http/             A BORDA DE ENTRADA
│  ├─ http.module.ts          controllers + APP_PIPE + APP_GUARD
│  ├─ controllers/core/       health
│  ├─ controllers/domain/     authentication, patients, appointments
│  ├─ schemas/domain/         schemas Zod + DTOs via createZodDto
│  └─ pipes/                  zod-validation-pipe.ts
│
├─ framework/                 PLUMBING do Nest
│  ├─ filters/errors/         exception-filter.ts
│  ├─ authentication/         JwtAuthGuard global, @Public(), @CurrentDoctor()
│  └─ cryptography/           adapters de PasswordHasher / TokenIssuer
│
├─ infrastructure/databases/typeorm/postgres/
│  ├─ typeorm-database.datasource.ts   o DataSource do CLI
│  ├─ database.providers.ts            o DataSource da aplicação
│  ├─ database.module.ts               @Global + shutdown da conexão
│  ├─ migrations/                      linha do tempo única — uma por sprint
│  ├─ repositories/                    adapters que implementam as portas
│  └─ seeds/                           demo.seed.ts (avaliação) · load.seed.ts (volume)
│
├─ presentation/presenters/   serialização de saída — nada de entity crua na resposta
└─ shared/
   ├─ constants/              tokens de DI
   ├─ errors/                 either.ts + types/ (DomainError com `code`)
   ├─ interfaces/cryptography/ PORTAS de cripto
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

<a id="ambiente-de-execução"></a>

## Ambiente de execução

O `docker-compose.yml` é **global** (raiz do repositório); o projeto NestJS mora em
`api/`, que é o cwd de todo `npm run`. Três containers: `api-prontomed`, `db-prontomed`
e `k6-prontomed` — este último ocioso até a [prova sob
estresse](test/stress/README.md).

**Portas:** API em `3333`; Postgres em **`5433` no host**, `5432` dentro da rede Docker
— 5432 costuma estar ocupada por outro stack na mesma máquina.

**Dois bancos, um container:** `prontomed` (desenvolvimento) e `prontomed_test` (e2e).
O segundo é criado por `api/db/init-test-db.sh`, que o entrypoint do Postgres roda **só
no primeiro boot do volume** — se ele não existir, `docker compose down -v` e suba de
novo. A API só sobe depois que o banco passa no healthcheck (`depends_on:
condition: service_healthy`), o que garante a ordem sem `sleep` no entrypoint.

O healthcheck da API **não sonda o banco, de propósito** (`docs/PLAN.md §13 F0`):
liveness e readiness são perguntas diferentes, e misturá-las faz um Postgres reiniciando
derrubar um processo saudável. O preço é que a API sobe verde sem migrations e só
quebra na primeira rota que tocar uma tabela.

### Por que `docker exec` em vez de `npm run` direto

O compose monta um volume **anônimo** em `/usr/src/app/node_modules` para preservar as
dependências da imagem, que o bind mount do código sobreporia. Consequência: **não
existe `node_modules` no host** — `npm test` responde `jest: not found`.

Rodar no host é possível, mas só se `npm install` vier **antes** do primeiro
`docker compose up`: depois disso o daemon já criou o ponto de montagem como `root`, e o
`npm install` falha com `EACCES` até apagar `api/node_modules` com `sudo`. Dentro do
container o problema não existe.

### Scripts

Todos rodam com `docker exec api-prontomed npm run <script>` — ou direto de `api/`, se
houver Node no host.

| Script | O que faz |
| --- | --- |
| `lint` · `typecheck` · `build` | gates de código |
| `test` · `test:e2e` | unitários · integração — o e2e **migra o `prontomed_test` sozinho** antes de rodar |
| `seed` | médico de avaliação + base de demonstração — idempotente, recusa `APP_ENV ≠ dev` |
| `migration:run` | aplica as migrations no banco de **desenvolvimento** |
| `migration:generate --name=sprint<NNMM>-<escopo>` | gera a migration a partir das entities, para **revisão** antes do commit |
| `migration:revert` | desfaz a última migration aplicada |

**A tabela lista o que se executa — e só.** O `package.json` tem dois scripts
deliberadamente fora dela, porque nenhum é passo de ninguém: cada um é **degrau** de um
comando que já está aqui.

| Script interno | Quem o dispara | Por que existe separado |
| --- | --- | --- |
| `migration:run:test` | `test:e2e`, antes do Jest | O banco de teste é do e2e e de mais ninguém. Migrar por fora era um passo a mais para preparar um banco que o próprio comando sabe preparar — e esquecê-lo dava `relation does not exist` |
| `seed:load` | `test:stress`, antes do k6 | O volume de carga é pré-condição do teste, não escolha do operador ([`test/stress/README.md`](test/stress/README.md)) |

Os dois são **idempotentes**: a segunda execução não repete migration nem duplica
volume, então acionar o comando de fora custa quase nada. É o que torna `test:e2e` e
`test:stress` auto-contidos — rodam do zero, em qualquer ordem, quantas vezes se
quiser.

**Exceções à regra do `docker exec`:** `test:stress` roda **no host**, de dentro de
`api/`, porque é orquestração — faz `docker exec` na API para o seed de volume e no k6
para o teste ([`test/stress/README.md`](test/stress/README.md)). O roteiro por
Playwright também roda no host, e pelo mesmo motivo invertido: o browser vive fora do
container ([`test/roteiro-mcp-playwright/`](test/roteiro-mcp-playwright/)).

> **Nunca `npx typeorm` direto** — sempre pelos scripts, que passam
> `typeorm-ts-node-commonjs` e o `-d` correto.

---

## Testes

Três camadas, três perguntas. As duas primeiras são Jest e vivem neste diretório; a
terceira é k6 e tem [documento próprio](test/stress/README.md).

| Camada | Monta | Prova | Onde |
| --- | --- | --- | --- |
| **Unitário** | `TestingModule` com a porta sobrescrita por um in-memory | regra pura, sem banco | `*.spec.ts` ao lado do alvo |
| **Integração** | `AppModule` inteiro + Supertest + Postgres real | rota → service → banco, incluindo constraints e o documento OpenAPI | `test/integration/*.e2e-spec.ts` |
| **Estresse** | k6 contra a API de pé | corretude sob corrida e latência sob volume | `test/stress/` |

Se um teste unitário precisar mockar `DataSource` ou o repositório concreto, isso é
vazamento de arquitetura — conserta-se o código, não o teste.

**A camada de integração é a única que prova o que só o banco garante:** o índice único
parcial que fecha o slot (INV-01), o `CHECK` que recusa anotação vazia por `INSERT`
direto, a FK `ON DELETE NO ACTION` que impede apagar consulta com anotação. Desde F6 ela
também é gate do documento OpenAPI: nenhuma rota sem `summary`, sem exemplo ou sem o 401
documentado.

**`test/factories/probe.controller.ts` é uma sonda**, e continua necessária mesmo com a
API completa: ela dá ao e2e um DTO simples e **estável** para exercitar o `APP_PIPE`
global (400 com `details[]`) e a derivação Zod → OpenAPI, sem amarrar esses testes ao
corpo de uma rota de produção que muda por outro motivo. É `@Public()` porque existe
para provar **pipe e filtro** — sem isso, os testes de envelope passariam a provar o
guard. Vive em `test/`, fora do alcance do `nest build`: não chega a produção.

> **Verde vale, mas confira a contagem.** O script é `jest --passWithNoTests`: se um dia
> o jest não encontrar nenhum arquivo de teste, ele sai **com sucesso** em vez de
> falhar. O output sempre diz quantas suítes rodaram — é esse número que confirma.

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
