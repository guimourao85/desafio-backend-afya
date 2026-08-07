# Sprint 01.02 — Kernel da plataforma (F1 de PLAN.md §13)

> Sumário:
> - §contexto — **tudo que a implementação precisa, embutido**: este doc é auto-contido
> - §objetivo — o esqueleto que todo módulo usa: erro com `code`, envelope único, validação global, banco conectado
> - §decisoes — 14 decisões, 6 de comparar com a `referencia_tecnica/`, 4 da fricção PRÉ
> - §nomes — token do DataSource, tabela de migration, os 8 `code` do catálogo
> - §escopo — 21 passos: erro → constantes → banco → borda HTTP → registro → teste
> - §edge-cases — 11 casos, incluindo os defeitos da referência que não vamos herdar
> - §checklist — o gate pré-fechamento, todo marcado
> - §scores — fricção PRÉ e PÓS, mais o que foi verificado à mão
> - §issues — 13 descobertas: 10 da implementação (uma virou DEBT-12) e 3 da passada de simplicidade
>
> **Plano canônico:** [PLAN.md §13 — F1](../../PLAN.md) · **Estado:** [PRODUCT.md §roadmap](../../PRODUCT.md) · **Formato:** [SPRINT-TEMPLATE.md](../../SPRINT-TEMPLATE.md)

**Branch:** `main` · **Início:** 2026-08-06 · **Fim:** 2026-08-06 · **Fase:** F1
**Status:** ✅ verde — `lint` `typecheck` `build` `test` (21) `test:e2e` (10); fricção PÓS aprovada
**Triagem:** COMPLEXO (16 arquivos, `DataSource` é decisão de banco) → plano + fricção PRÉ ≥9/10 + aprovação + implementar + fricção PÓS
**Agentes:** `[Backend]` `[Produto]` (no limite) · `[Database]` `[QA]` (obrigatórios, fora do limite)

---

<!-- §contexto -->
## Contexto embutido — leia só este arquivo

**Este sub-doc é auto-contido por decisão.** Quem implementar esta sprint com o
contexto zerado não precisa abrir `PLAN.md` nem a `referencia_tecnica/`: o que era
necessário foi resolvido na fricção PRÉ e está aqui.

> **Preço declarado.** As três caixas abaixo **duplicam** `PLAN.md §11.1`, `§11.2` e
> `§9.4`. Duplicação consciente, mesma doutrina do sprint-doc de 01.01.
> **Divergiu? `PLAN.md` vence, e quem se corrige é este arquivo.**

### Estado do repositório ao abrir a sprint

F0 entregou: NestJS 10 com TS strict, ESLint flat config com a regra de fronteira,
Jest, Docker (api + Postgres 16 com `prontomed` e `prontomed_test`), `EnvironmentService`
sobre schema Zod, e `GET /api/health` → `{"status":"ok"}`. Existem 8 arquivos em
`src/` e **nenhum** artefato de banco: sem entity, sem migration, sem `DataSource`,
sem a pasta `src/infrastructure/`. Gates verdes: `lint` `typecheck` `build`
`test` (7) `test:e2e` (2). Ambiente: `NODE_ENV=development` + `APP_ENV=dev`;
Postgres em `5433` no host e `5432` na rede Docker.

### `Either` — o que escrever (PLAN §11.1)

```ts
export class Left<L, R> {
  constructor(readonly value: L) {}
  isLeft(): this is Left<L, R> { return true; }
  isRight(): this is Right<L, R> { return false; }
}
export class Right<L, R> {
  constructor(readonly value: R) {}
  isLeft(): this is Left<L, R> { return false; }
  isRight(): this is Right<L, R> { return true; }
}
export type Either<L, R> = Left<L, R> | Right<L, R>;
export const left  = <L, R>(v: L): Either<L, R> => new Left(v);
export const right = <L, R>(v: R): Either<L, R> => new Right(v);
```

### `DomainError` — o que escrever (PLAN §11.2)

```ts
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) { super(message); this.name = new.target.name; }
}
```

### Envelope e catálogo de erro (PLAN §9.4) — o contrato

```jsonc
{ "statusCode": 409, "code": "SCHEDULE_CONFLICT",
  "message": "Já existe um agendamento neste horário.",
  "details": [ { "path": "scheduledAt", "message": "…" } ]   // SÓ em 400
}
```

| `code` | Status | Quando | Classe a criar em F1 |
| --- | --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Zod rejeitou | — (o filtro produz direto) |
| `INVALID_CREDENTIALS` | 401 | email ou senha incorretos | `InvalidCredentialsError` |
| `UNAUTHENTICATED` | 401 | sem token, inválido ou expirado | `UnauthenticatedError` |
| `INVALID_REFRESH_TOKEN` | 401 | refresh inexistente, expirado ou revogado | `InvalidRefreshTokenError` |
| `RESOURCE_NOT_FOUND` | 404 | inexistente **ou de outro médico** (INV-04) | `ResourceNotFoundError` |
| `SCHEDULE_CONFLICT` | 409 | horário ocupado (INV-01) | `ScheduleConflictError` |
| `BUSINESS_RULE_VIOLATION` | 422 | payload válido, regra violada | `BusinessRuleViolationError` |
| `INTERNAL_ERROR` | 500 | inesperado — mensagem genérica, stack só no log | — |

**O filtro nunca vaza nome de constraint.** `23505` em `uk_appointments_doctor_slot`
vira 409 com mensagem humana, não `duplicate key value violates unique constraint`.

### Ordem de resolução do filtro (decisões 11–13)

```
1. ZodValidationException (nestjs-zod)  → 400 VALIDATION_ERROR + details[]
2. DomainError                          → status do catálogo, code = err.code
3. QueryFailedError com driverError.code '23505' → 409 SCHEDULE_CONFLICT
4. HttpException                        → status próprio; code derivado (decisão 12);
                                          message PT-BR do mapa (decisão 13)
5. qualquer outra coisa                 → 500 INTERNAL_ERROR, mensagem genérica,
                                          Logger.error com a stack
```

### O que a `referencia_tecnica/` resolveu — e o que dela foi descartado

| Peça | Copiado | Descartado, e por quê |
| --- | --- | --- |
| `DataSource` | **dois** arquivos: um para o CLI (lê `process.env`), um para a app (via `EnvironmentService`) | `getDataSource()` global sobre variável de módulo — service locator |
| `DatabaseModule` | `@Global()`, `providers` = `exports` | `console.log`/`console.error` no provider |
| `Either` | idêntico em substância | — |
| `ZodValidationPipe` | — | recebe `ZodSchema` no construtor ⇒ é por rota; lá está em 19% dos controllers |
| Filtro | `@Catch()` sem argumento; mensagem genérica que não serializa `exception.message` | conhece **só** `HttpException` ⇒ **`ZodError` vira 500**; envelope sem `code` |
| `migrations` path | — | glob `'src/**/migrations/*.ts'`, relativo ao cwd e cego ao `dist/` |

### Fatos verificados na fricção PRÉ (não re-verificar)

```
nestjs-zod v3.0.0 exporta: createZodDto · createZodValidationPipe ·
                           ZodValidationException · patchNestJsSwagger · zodToOpenAPI
typeorm/cli-ts-node-commonjs.js: ZERO ocorrência de "tsconfig-paths"
                           ⇒ o CLI NÃO resolve o alias @/  (decisão 2b)
dotenv: NÃO está em dependencies — só transitivo via @nestjs/config  (decisão 3b)
```
<!-- /§contexto -->

---

<!-- §objetivo -->
## Objetivo

Hoje a API sobe e responde `/api/health`, e é só isso: não fala com o banco, não
valida payload, e qualquer erro vira stack do Express. Esta sprint instala as quatro
peças que **todo** módulo de F2 em diante consome, sem uma linha de regra de negócio.

Depois dela: um caso de uso devolve `Left(erro)` em vez de lançar; esse erro vira uma
resposta HTTP com `code` estável e mensagem em PT-BR; payload malformado morre na
borda com 400 e a lista de campos; e um repositório tem de onde puxar conexão. O
`npm run migration:run` passa a existir de verdade — hoje falha por não haver
`DataSource` para apontar.

O que a sprint entrega não é código de negócio: é o **contrato de erro**. Depois que
F2 tiver oito endpoints, mudar o formato de erro é mexer em tudo. Por isso ele entra
antes do primeiro endpoint autenticado existir.

**Módulos impactados:** nenhum de domínio. Toca `shared/`, `framework/filters/`,
`gateways/http/pipes/`, `infrastructure/databases/` e o `app.module`/`main`.
**Risco principal se falhar:** o contrato de erro sair frouxo — retrabalho em F2–F5
multiplicado pelo número de endpoints, e é o que o avaliador vê em toda chamada que
falha no Swagger. **Risco número dois, achado na fricção PRÉ:** fechar verde com as
migrations sem alcançar `prontomed_test`, e descobrir só em F2 (ALTO 1).
**Gatilhos de ativação:** 6+ arquivos → 3 agentes · toca `DataSource` e
`migrationsTableName` → **`+[Database]`** · define contrato visível ao cliente →
**`+[Produto]`** · fase de `§13` que fecha → **`+[QA]`**. `[Seguranca]` **não** entra:
sem auth, PII, `doctorId` ou segredo novo — entra em 02.01.

**Fora do escopo desta sprint:**

| Item | Vai para |
| --- | --- |
| Qualquer entity, qualquer migration | **02.01 (F2)** — a primeira é `authentication` |
| `JwtAuthGuard`, `APP_GUARD`, `@Public()`, `@CurrentDoctor()` | 02.01 (F2) |
| Portas de repositório, adapters, `*.provider.ts` de domínio | 02.01 (F2) |
| Presenters | 02.01 (F2) — o primeiro é `SessionPresenter` |
| Swagger em `/api/docs` (`patchNestJsSwagger`, `DocumentBuilder`) | 05.01 (F6) |
| Seed de demonstração | 05.01 (F6) |

> **Correção de uma ressalva de 01.01.** Fechei aquela sprint dizendo que o
> `/api/health` viraria "o único endpoint fora do envelope padrão de §9.4". Isso
> conflacionou duas coisas: `§9.4` é envelope de **erro**, e o health devolve
> **sucesso**. Resposta 200 não usa aquele formato — não há exceção a abrir nem nada
> a decidir aqui. O que sobra do health é o `@Public()` quando o `APP_GUARD` entrar
> em 02.01, já registrado lá.
<!-- /§objetivo -->

---

<!-- §decisoes -->
## Decisões de execução

Seis (2, 4, 5, 6, 7, 9) saíram de ler a `referencia_tecnica/` antes de decidir.
Quatro (2b, 3b, 12, 13) saíram da **fricção PRÉ**, que reprovou a primeira versão
deste doc com 4 ALTO.

| # | Decisão | Escolha | Rationale | Alternativa descartada |
| --- | --- | --- | --- | --- |
| 1 | Onde o filtro é registrado | `app.useGlobalFilters()` no `main.ts` | É o que `PLAN.md §11.10` especifica; o filtro instancia `Logger` internamente e não precisa de DI | `APP_FILTER` no `HttpModule`: só se passar a injetar serviço |
| 2 | Quantos `DataSource` | **Dois.** `typeorm-database.datasource.ts` (CLI, `process.env`) + `database.providers.ts` (app, `EnvironmentService`) | Padrão da referência, e forçado: o CLI roda fora do Nest e não tem DI. Os scripts de `§14.2` já apontam para o primeiro via `-d` | Um só: o provider da app não é alcançável pelo CLI |
| **2b** | Import do barril **no DataSource do CLI** | **Relativo** (`../../../../domains/domain/model-entities`), nunca `@/` | Verificado: `cli-ts-node-commonjs.js` não registra `tsconfig-paths`. Com `@/`, `migration:generate` morre em `Cannot find module`. É exceção declarada à convenção de F0 | `@/domains/...`: quebra o CLI, e o sintoma não aponta para a causa |
| 3 | Barril `model-entities/index.ts` em F1 | **Criar vazio** (`export default []`) | O `DataSource` exige `entities`, e F1 não tem entity. O barril nasce agora e F2 só acrescenta | Adiar o `DataSource` para F2: empilha kernel + auth + primeira migration |
| **3b** | `dotenv` | **Adicionar a `dependencies`** e importar `dotenv/config` no DataSource do CLI | Verificado: hoje só existe como transitivo do `@nestjs/config`. Depender de transitivo é quebra silenciosa num `npm update` | Confiar no transitivo |
| 4 | Envelope de erro | **`PLAN.md §9.4` estrito**: `{ statusCode, code, message, details? }` | `§9.4` é o contrato, e `code` é o campo contra o qual o cliente programa | O da referência — `{ statusCode, timestamp, path, message }`, **sem `code`**. Preço: sem `path` no corpo, o debug depende do log |
| 5 | `ZodValidationPipe` | **Global** (`APP_PIPE`), via `createZodValidationPipe()` do `nestjs-zod`, com schema derivado do DTO (`createZodDto`) | `PLAN.md §12.1`: validação opcional é validação ausente. A lib já resolve a derivação — reimplementar é reinventar | O da referência, que recebe `ZodSchema` no construtor: por construção é por rota |
| 6 | Como o erro do Zod chega ao filtro | O pipe lança `ZodValidationException` (default do `nestjs-zod`); o filtro a reconhece e lê `getZodError().issues` | Na referência o pipe faz `schema.parse()` e o filtro só conhece `HttpException` — payload inválido vira **500** | Deixar `ZodError` cru cair no ramo genérico: é o defeito herdado |
| 7 | Singleton do `DataSource` | **Sem `getDataSource()` global.** Quem precisa injeta o token | A referência exporta acessor global sobre variável de módulo — service locator, ALTO em `review-backend.md §verifica` | Copiar o `getDataSource()` |
| 8 | Falha de conexão no boot | **Fail-fast**: `await dataSource.initialize()` no `useFactory` | Mesma doutrina do schema de env: morrer no start com mensagem legível > responder 500 na primeira requisição | Conexão preguiçosa |
| 9 | Caminho das migrations | `[join(__dirname, 'migrations', '*{.ts,.js}')]` | Relativo ao arquivo: funciona de qualquer cwd e depois do build | Glob `'src/**/migrations/*.ts'` da referência |
| 10 | Banco que o e2e usa | `NODE_ENV === 'test'` → o provider da app seleciona `POSTGRES_DB_TEST` | Fecha a ressalva de 01.01 e dá o primeiro consumidor real ao `prontomed_test` e ao eixo `NODE_ENV`, que o Jest já injeta | Um banco só: teste truncando tabela destrói o seed de F6 e o roteiro de F7 |
| **10b** | Migrations no banco de teste | Script novo **`migration:run:test`**, com `POSTGRES_DB` sobrescrito para `$POSTGRES_DB_TEST` | O CLI lê `process.env` e ignora a decisão 10. Sem isto, F1 fecha verde (não há tabela) e **F2 quebra** com `relation does not exist` | Deixar implícito: falha diferida, a pior espécie |
| 11 | `details[].path` | **String**, do `issue.path.join('.')` | Zod entrega array (`['user','name']`); `§9.4` mostra string. `user.name` é o que o cliente lê | Array cru: diverge do contrato publicado |
| 12 | `code` de `HttpException` fora do catálogo | Derivar do status: `400→VALIDATION_ERROR` · `401→UNAUTHENTICATED` · `404→RESOURCE_NOT_FOUND` · `409→SCHEDULE_CONFLICT` · `422→BUSINESS_RULE_VIOLATION` · **qualquer outro → `INTERNAL_ERROR`** | O Nest lança fora do catálogo (404 de rota, 405, 413). Sem regra, o contrato tem buraco e o campo `code` fica opcional na prática | Inventar `code` novo por status: infla o catálogo que o Swagger publica |
| 13 | Mensagem de `HttpException` do próprio Nest | Mapa PT-BR por status; `404 → "Recurso não encontrado."` | Rota inexistente devolve `Cannot GET /api/foo` — inglês, viola ADR-13, e é a primeira coisa que o avaliador vê ao errar uma URL | Repassar a mensagem do Nest |
| 14 | `logging` do TypeORM | **`false`** nos dois DataSources, explícito | Log de query não é pedido por nada da POC e polui a saída do e2e. Explícito para não depender de default | `logging: true` (referência) ou variável de env nova: `Apêndice F` está fechado desde F0 |

> Nenhuma muda agregado, invariante ou contrato de domínio — **nenhuma vira ADR**. A
> nº 4, 11, 12 e 13 fixam contrato **externo**: mudá-las depois de F2 é mudança de
> API, e aí vira ADR.
<!-- /§decisoes -->

---

<!-- §nomes -->
## Nomes fixados

F1 não cria tabela, coluna nem constraint. Os nomes são de token de DI, de arquivo e
de `code` — este último é **contrato público**, visível no Swagger a partir de F6.

| Tipo | Nome | Onde | Descrição |
| --- | --- | --- | --- |
| Token DI | `PRONTOMED_POSTGRES_DATA_SOURCE` | `shared/constants/index.ts` | injeta o `DataSource` (PLAN §11.6) |
| Classe | `AllExceptionsFilter` | `framework/filters/errors/` | `@Catch()` sem argumento |
| Classe | `ZodValidationPipe` | `gateways/http/pipes/` | produzido por `createZodValidationPipe()` |
| Classe | `DatabaseModule` | `infrastructure/.../postgres/` | `@Global()` |
| Const | `AppDataSource` | `typeorm-database.datasource.ts` | o do CLI, alvo do `-d` dos scripts |
| Tabela | `typeorm_migrations` | `migrationsTableName` | fixado em 01.01; honrado nos **dois** DataSources |
| Script | `migration:run:test` | `package.json` | decisão 10b |
| Erro | os **8 `code`** de `§9.4` | `DomainError.code` | tabela completa em §contexto |

> As 6 classes de `DomainError` nascem em F1 mesmo sem quem as lance — mesma doutrina
> da decisão nº 2 de 01.01: o catálogo não é reeditado a cada fase.
<!-- /§nomes -->

---

<!-- §escopo -->
## Escopo — plano ordenado

Todo caminho parte de `api/`. Ordem: erro → constantes → banco → borda HTTP →
registro → teste.

| # | Ação | Arquivo | Tipo | Depende de |
| --- | --- | --- | --- | --- |
| 1 | Criar | `src/shared/errors/either.ts` — §contexto | NOVO | — |
| 2 | Criar | `src/shared/errors/types/domain-error.ts` — abstrata com `code` | NOVO | — |
| 3 | Criar | `src/shared/errors/types/index.ts` — as 6 classes concretas | NOVO | 2 |
| 4 | Criar | `src/shared/constants/index.ts` — `PRONTOMED_POSTGRES_DATA_SOURCE` | NOVO | — |
| 5 | Criar | `src/domains/domain/model-entities/index.ts` — barril **vazio** (decisão 3) | NOVO | — |
| 6 | Editar | `package.json` — `dotenv` em `dependencies` (3b) + script `migration:run:test` (10b) | ALTER | — |
| 7 | Criar | `src/infrastructure/databases/typeorm/postgres/typeorm-database.datasource.ts` — CLI, **import relativo** (2b) | NOVO | 5, 6 |
| 8 | Criar | `.../postgres/database.providers.ts` — `useFactory` com `EnvironmentService`, seleção do banco por `NODE_ENV` (10) | NOVO | 4, 5 |
| 9 | Criar | `.../postgres/database.module.ts` — `@Global()` | NOVO | 8 |
| 10 | Criar | `src/framework/filters/errors/exception-filter.ts` — os 5 ramos do §contexto | NOVO | 3 |
| 11 | Criar | `src/gateways/http/pipes/zod-validation-pipe.ts` — `createZodValidationPipe()` (5) | NOVO | — |
| 12 | Editar | `src/gateways/http/http.module.ts` — registra `APP_PIPE` | ALTER | 11 |
| 13 | Editar | `src/app.module.ts` — importa `DatabaseModule` | ALTER | 9, 12 |
| 14 | Editar | `src/main.ts` — `app.useGlobalFilters(new AllExceptionsFilter())` | ALTER | 10 |
| 15 | Criar | `src/shared/errors/either.spec.ts` | NOVO | 1 |
| 16 | Criar | `src/framework/filters/errors/exception-filter.spec.ts` — os **5 ramos** | NOVO | 10 |
| 17 | Criar | `test/integration/error-envelope.e2e-spec.ts` — rota inexistente (PT-BR + `code`) e payload inválido | NOVO | 14 |
| 18 | Verificar | `migration:run` **e** `migration:run:test` conectam e criam `typeorm_migrations` nos dois bancos | — | 7 |
| 19 | Editar | `api/README.md` — migrations deixam de ser "a preencher"; documentar os dois comandos | ALTER | 18 |
| 20 | Criar | `src/app.setup.ts` — `configureApp()`, prefixo + filtro (**issue 4**, fricção PÓS) | NOVO | 10 |
| 21 | Criar | `test/integration/database-connection.e2e-spec.ts` — prova a decisão 10 (**issue 5**) | NOVO | 8 |

> Os passos 20 e 21 não estavam no plano: 20 saiu da fricção PÓS, 21 do item de
> §checklist que exigia *provar* a seleção do banco dentro do e2e e não tinha
> arquivo onde morar.

### Migrations

**Nenhuma.** F1 cria a conexão e o lugar onde as migrations de F2 vão morar.
`migrationsRun` fica **false**: migration roda por comando, nunca no boot
(`review-database.md §regras`, item 5). `synchronize: false` nos dois DataSources.

**Commits sugeridos** (PLAN §13 F1): `feat: either e erros de dominio com code` ·
`feat: filtro global de excecoes` · `feat: pipe global de validacao zod` ·
`feat: data source e modulo de banco`
<!-- /§escopo -->

---

<!-- §edge-cases -->
## Edge cases

| # | Caso | Comportamento esperado | Coberto por |
| --- | --- | --- | --- |
| 1 | Payload rejeitado pelo Zod | **400** `VALIDATION_ERROR` com `details[]`, `path` já em string | decisão 6 + 11 — **na referência isso vira 500** |
| 2 | `QueryFailedError` `23505` | **409** com mensagem humana; **nunca** o texto do driver com nome de índice | filtro + spec. Sem constraint real até F4 — testado com erro forjado |
| 3 | `throw 'string'` ou não-`Error` | **500** genérico, sem estourar dentro do próprio filtro | ramo 5 |
| 4 | Erro inesperado | Corpo genérico; **stack só no `Logger.error`**, nunca na resposta | filtro + checklist |
| 5 | Banco indisponível no boot | Processo **morre no start** com erro legível | decisão 8 |
| 6 | `GET /api/health` depois do `APP_PIPE` | Continua **200** — não há parâmetro a validar | e2e de 01.01, que segue verde |
| 7 | Rota inexistente | **404** no envelope, `code: RESOURCE_NOT_FOUND`, mensagem **PT-BR** | decisões 12 + 13, e2e |
| 8 | e2e roda com `NODE_ENV=test` | O provider seleciona `POSTGRES_DB_TEST`; o banco de dev não é tocado | decisão 10 + asserção do banco conectado |
| 9 | Migration precisa existir no banco de teste | `migration:run:test` roda contra `$POSTGRES_DB_TEST` | decisão 10b + passo 18 |
| 10 | Status HTTP fora do catálogo (405, 413) | `code: INTERNAL_ERROR`, status preservado, mensagem genérica quando não há uma própria mapeada | decisão 12 + issue 12 |
| 11 | `details[]` em resposta que não é 400 | **Nunca aparece** — o campo é exclusivo do ramo 1 | filtro + spec |

> Nenhum caso de escopo por médico nem de concorrência: não há `doctorId`, não há
> escrita, INV-01 e INV-04 não estão em jogo.
<!-- /§edge-cases -->

---

<!-- §checklist -->
## Checklist anti-erro (pré-fechamento)

**Verde**
- [x] `lint` + `typecheck` + `build` + `test` (21) + `test:e2e` (10) — todos verdes
- [x] Critério de `PLAN.md §13 F1`: rota inexistente devolve o envelope — conferido com `curl` no container. O "500 sem stack" foi provado por **spec**, não à mão: F1 não tem rota capaz de forçar um 500 real, e inventar uma seria código morto no repositório
- [x] `npm run migration:run` **e** `npm run migration:run:test` executam e criam `typeorm_migrations` — conferido nos **dois** bancos com `\dt`

**Banco**
- [x] `synchronize: false` e `migrationsRun: false` **explícitos** nos dois DataSources
- [x] `migrationsTableName: 'typeorm_migrations'` nos dois — sem assimetria
- [x] `migrations` por caminho relativo ao **arquivo** (decisão 9)
- [x] O DataSource do CLI usa import **relativo** do barril — `migration:generate --name=probe` carregou o barril e respondeu "No changes in database schema were found"; nenhum arquivo a apagar, porque sem entity não há o que gerar
- [x] `logging: false` explícito nos dois (decisão 14) — o CLI sobrescreve, ver issue 7
- [x] Nenhuma entity, nenhuma migration criada nesta sprint
- [x] `NODE_ENV=test` seleciona `POSTGRES_DB_TEST` — provado por `SELECT current_database()` dentro do e2e

**Contrato**
- [x] Os 5 ramos do filtro implementados e cobertos por spec
- [x] `details[]` só em 400, com `path` em string
- [x] Toda mensagem em PT-BR, inclusive as que vêm do Nest (decisão 13)
- [x] Nenhuma resposta contém nome de constraint, SQL ou stack — asserção explícita no spec do ramo 3
- [x] Todo status fora do catálogo cai em `INTERNAL_ERROR` (decisão 12)

**Arquitetura**
- [x] Nenhum `getDataSource()` global; quem precisa injeta o token
- [x] Nenhum `console.log`/`console.error` — `Logger` do Nest
- [x] Regra de fronteira segue provada: sonda em `services/` continua reprovando
- [x] Estrutura conforme `PLAN.md §10` — única adição fora dela: `src/app.setup.ts` (issue 4)

**Higiene**
- [x] `dotenv` em `dependencies`, não transitivo
- [x] Nenhum `TODO`, nenhum arquivo morto (o `repositories.ts` vazio não foi criado)
- [x] Scores ≥ 9/10 na fricção PÓS; zero CRÍTICO e zero ALTO em aberto — 3 MÉDIO, um deles virou DEBT-12 e um foi corrigido na hora
- [x] `PRODUCT.md §roadmap`: linha 01.02 → ✅
<!-- /§checklist -->

---

<!-- §scores -->
## Scores de fricção

| Agente | Fase | Score | Severidade máxima | Observação |
| --- | --- | --- | --- | --- |
| `[Database]` | PRÉ | **7/10 → 9/10** | ALTO (2) | REJECTED na 1ª passada: migrations nunca alcançariam `prontomed_test` (falha diferida para F2) e o DataSource do CLI usaria `@/`, que o CLI não resolve. Re-scorado após 2b, 3b, 10b, 14 |
| `[Backend]` | PRÉ | **8/10 → 9/10** | ALTO (1) | Ambiguidade entre §escopo #11 e decisão 5 sobre reimplementar ou configurar o pipe. Resolvida por verificação do `nestjs-zod`; `repositories.ts` vazio cortado |
| `[Produto]` | PRÉ | **7/10 → 9/10** | ALTO (2) | REJECTED: `code` indefinido para `HttpException` fora do catálogo e 404 devolvendo `Cannot GET` em inglês. Re-scorado após 11, 12, 13 |
| `[Database]` | PÓS | **10/10** | — | Nenhuma entity, nenhuma migration. `synchronize: false`, `migrationsRun: false`, `migrationsTableName` e caminho relativo conferidos nos **dois** DataSources; `typeorm_migrations` verificada com `\dt` em `prontomed` **e** `prontomed_test`. A correção da 10b (issue 1) é o que fecha o ALTO 1 da fricção PRÉ — e ela só apareceu na implementação |
| `[Backend]` | PÓS | **9/10** | MÉDIO (1) | Camadas respeitadas, sonda de fronteira segue reprovando, zero `getDataSource()`, zero `console.*`. MÉDIO: os dois DataSources duplicam as opções de conexão — duplicação da decisão 2, consciente, e o custo é uma edição a mais por opção nova |
| `[Produto]` | PÓS | **9/10** | MÉDIO (1) | Envelope estrito de §9.4, `details[]` só no 400, todo status fora do catálogo em `INTERNAL_ERROR`, nenhuma resposta com SQL, constraint ou stack. MÉDIO: a mensagem fixa do `23505` (issue 8) → **DEBT-12** |
| `[QA]` | PÓS | **9/10** | MÉDIO (1) | 5 ramos do filtro cobertos + o negativo (`42P01` cai no genérico) + a exclusividade do `details[]`; e2e cobre rota inexistente, payload inválido, campo desconhecido e caminho feliz. Determinístico: sem relógio, sem ordem, sem estado compartilhado. MÉDIO **corrigido durante a fricção**: a configuração do `main.ts` não era exercitada (issue 4) |

| `[Backend]` | PÓS 2ª | **10/10** | — | Passada de **simplicidade** ([PLAN.md §3.1](../../PLAN.md)), pedida depois da 1ª: catálogo de `code` fechado como tipo (issue 11), duas mensagens "por precaução" cortadas (issue 12), um método privado de uso único inlinado (issue 13), comentários longos reduzidos ao porquê. O filtro perdeu 12 linhas sem perder um ramo |

**Conflitos entre agentes:** nenhum, nem na PRÉ nem na PÓS. Os 5 ALTO da PRÉ foram
independentes; os 3 MÉDIO da PÓS não se cruzam.

> A 2ª passada não achou defeito de comportamento — achou **excesso**. O padrão dos
> três: proteção escrita para um caso que o compilador já cobre (11), para um caso
> que não existe (12) e para uma estrutura que encolheu (13). Vale como lembrete de
> que defensivo demais também é dívida.

**Verificações feitas à mão, não inferidas** (fricção PÓS):

```
curl /api/nao-existe → {"statusCode":404,"code":"RESOURCE_NOT_FOUND",
                        "message":"Recurso não encontrado."}   (container real)
docker compose stop database + restart api → ExceptionHandler: getaddrinfo
   ENOTFOUND database, sem "successfully started"              (fail-fast, decisão 8)
\dt em prontomed e prontomed_test → typeorm_migrations nos dois
migration:generate --name=probe → "No changes in database schema were found"
   (o CLI carregou o barril: com `@/` teria morrido antes — decisão 2b)
sonda em services/ importando typeorm → ESLint reprova (regra de fronteira viva)
```

> A fricção PRÉ reprovou a **primeira versão deste doc**, não o código — que ainda não
> existe. Os 5 ALTO foram corrigidos no plano; 3 deles (10b, 12, 13) eram falha
> diferida, que só apareceria em F2 ou na mão do avaliador.
<!-- /§scores -->

---

<!-- §issues -->
## Issues encontrados durante a implementação

| # | Descoberta | Causa raiz | Solução | Arquivos | Virou |
| --- | --- | --- | --- | --- | --- |
| 1 | A decisão 10b **não funcionava como escrita**: `POSTGRES_DB=$POSTGRES_DB_TEST` no script expande para vazio no host — a variável mora no `.env`, não no shell — e `dotenv` não sobrescreve chave já definida em `process.env`, nem quando o valor é `''` | Confundi "está no `.env`" com "está no ambiente do shell". Só coincide dentro do container, onde o compose injeta o `env_file` | O script liga `NODE_ENV=test` e o DataSource do CLI seleciona o banco pelo **mesmo eixo** do provider da app. Efeito idêntico, mecanismo determinístico nos dois lugares, zero variável nova | `package.json`, `typeorm-database.datasource.ts` | correção da decisão 10b |
| 2 | `test:e2e` verde, mas o Jest não encerrava ("did not exit one second after") | `DataSource` criado por `useFactory`: o Nest sabe construí-lo e não sabe que `destroy()` é o fim dele. O pool sobrevivia ao `app.close()` — e sobreviveria a um shutdown de produção | `DatabaseModule implements OnModuleDestroy`, injetando o próprio token | `database.module.ts` | — |
| 3 | O filtro não compilava: `Response` do Express sem tipos | `@types/express` não é dependência do projeto (nunca foi — F0 não precisou) | Interface estrutural de 3 linhas com a superfície usada (`status().json()`), em vez de instalar `@types/express`. O filtro deixa de conhecer o transporte concreto | `exception-filter.ts` | — |
| 4 | **Fricção PÓS, `[QA]`:** o filtro era registrado no `main.ts`, mas cada e2e o registrava por conta própria — apagar a linha do bootstrap deixaria a suíte inteira verde | Configuração duplicada entre produção e teste: o teste reproduzia o `main.ts` em vez de usá-lo | `app.setup.ts` com `configureApp()`, consumido pelo `main.ts` **e** pelos e2e. Swagger fica fora dele (F6): e2e não monta OpenAPI | `app.setup.ts`, `main.ts`, 2 e2e | passo 20 |
| 5 | O item de §checklist "provar a seleção do banco dentro do e2e" não tinha arquivo previsto | §escopo listou só o e2e de envelope | `database-connection.e2e-spec.ts`: afirma `current_database()`, `synchronize`, `migrationsRun` e `migrationsTableName` | `test/integration/` | passo 21 |
| 6 | Não havia como exercitar o ramo 1 ponta a ponta: F1 não entrega endpoint com corpo | O contrato de erro nasce **antes** dos endpoints, de propósito | Controller de sonda declarado dentro do próprio e2e. O `APP_PIPE` que ele exercita é o global de verdade | `error-envelope.e2e-spec.ts` | — |
| 7 | `logging: false` (decisão 14) não silencia o `migration:run` | O CLI do TypeORM sobrescreve as opções do DataSource e força log de query | Nada a fazer: a decisão vale para a **aplicação**, que é onde a poluição importava. Fica registrado para não ser lido como desvio | — | observação |
| 8 | Todo `23505` responde "Já existe um agendamento neste horário", qualquer que seja a constraint | O filtro traduz o código do Postgres, não o nome do índice | Aceito enquanto a agenda for a única unicidade alcançável por requisição; o nome da constraint vai para o log | `exception-filter.ts` | **DEBT-12** |
| 9 | O provider da referência declara `imports:` dentro do objeto de provider | Custom provider não tem `imports` — a chave é ignorada pelo Nest. Funciona lá por acidente: `EnvironmentModule` é `@Global` | Descartado. O provider injeta `EnvironmentService` direto | `database.providers.ts` | — |
| 10 | O README apontava tokens em `shared/constants/repositories.ts` | Arquivo que a fricção PRÉ cortou (§nomes) e que o README de 01.01 já citava | Corrigido para `shared/constants/` | `README.md` | — |
| 11 | **2ª passada de fricção PÓS (simplicidade):** `DomainError.code` era `string`, e por isso o filtro precisava de um ramo defensivo — `if (status)`, log, 500 — para o `code` que ninguém mapeou | Tipo aberto empurra para runtime uma checagem que o compilador faz de graça | `DomainErrorCode` fechado e `Record<DomainErrorCode, number>`: o mapa é exaustivo **por construção**. Menos 8 linhas no filtro, e `code` novo sem status vira erro de build — verificado com um code de mentira: `TS2741 Property ... is missing` | `domain-error.ts`, `exception-filter.ts` | — |
| 12 | O mapa de mensagens tinha 403 e 405 | Escritos "por precaução". 403 **contradiz INV-04** (recurso alheio é 404, nunca 403) e 405 não é produzido: Express devolve 404 para verbo não mapeado | Ambos cortados. O spec do 405 passa a provar o **fallback** genérico — que é o comportamento real, e vale mais que uma mensagem que nunca aparece | `exception-filter.ts` e spec | ajuste no §edge-cases 10 |
| 13 | `internalError()` privado ficou com um uso só depois do issue 11 | Método extraído quando havia dois chamadores | Inline no ramo 5 | `exception-filter.ts` | — |
| 14 | A decisão 10 dependia de o **Jest injetar** `NODE_ENV=test`, e ele só injeta quando a variável não vem definida. Dentro do container ela vem: o `env_file` do compose entrega `NODE_ENV=development`. Um `docker exec ... npm run test:e2e` apontaria o e2e para o banco de **desenvolvimento** | Proteção apoiada em comportamento implícito de ferramenta, não em declaração explícita | `test:e2e` passa a declarar `NODE_ENV=test`, como o `migration:run:test` já fazia. Deixa de importar o que o Jest decide, e o comando vale igual dentro e fora do container | `package.json`, `PLAN.md §14.2` | — |
| 15 | `npm install` no host falha com `EACCES` depois do primeiro `docker compose up` | O volume anônimo `/usr/src/app/node_modules` faz o daemon criar o mountpoint em `api/node_modules` como **root**. A ordem `install → up` funciona; `up → install` não | README passa a rodar tudo por `docker exec`; a armadilha fica registrada em `PLAN.md` Apêndice E | `README.md`, `PLAN.md` Ap. E | — |

> Preencher **durante** a sprint, não no fechamento.
> Herdado de 01.01: o `prontomed_test` existia sem consumidor — as decisões 10 e 10b
> desta sprint fecham aquela ressalva.
<!-- /§issues -->
