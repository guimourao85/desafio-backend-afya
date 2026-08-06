# Sprint 01.02 — Kernel da plataforma (F1 de PLAN.md §13)

> Sumário:
> - §contexto — **tudo que a implementação precisa, embutido**: este doc é auto-contido
> - §objetivo — o esqueleto que todo módulo usa: erro com `code`, envelope único, validação global, banco conectado
> - §decisoes — 14 decisões, 6 de comparar com a `referencia_tecnica/`, 4 da fricção PRÉ
> - §nomes — token do DataSource, tabela de migration, os 8 `code` do catálogo
> - §escopo — 19 passos: erro → constantes → banco → borda HTTP → registro → teste
> - §edge-cases — 11 casos, incluindo os defeitos da referência que não vamos herdar
> - §checklist — o gate pré-fechamento
> - §scores — fricção PRÉ (registrada) e PÓS
> - §issues — o que aparecer durante a implementação
>
> **Plano canônico:** [PLAN.md §13 — F1](../../PLAN.md) · **Estado:** [PRODUCT.md §roadmap](../../PRODUCT.md) · **Formato:** [SPRINT-TEMPLATE.md](../../SPRINT-TEMPLATE.md)

**Branch:** `main` · **Início:** 2026-08-06 · **Fase:** F1
**Status:** ⬜ não iniciada — fricção PRÉ aprovada, aguardando implementação
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
| 10 | Status HTTP fora do catálogo (405, 413) | `code: INTERNAL_ERROR`, status preservado | decisão 12 |
| 11 | `details[]` em resposta que não é 400 | **Nunca aparece** — o campo é exclusivo do ramo 1 | filtro + spec |

> Nenhum caso de escopo por médico nem de concorrência: não há `doctorId`, não há
> escrita, INV-01 e INV-04 não estão em jogo.
<!-- /§edge-cases -->

---

<!-- §checklist -->
## Checklist anti-erro (pré-fechamento)

**Verde**
- [ ] `lint` + `typecheck` + `build` + `test` + `test:e2e` — todos verdes
- [ ] Critério de `PLAN.md §13 F1` verificado à mão: rota inexistente devolve o envelope; erro forçado devolve 500 **sem stack**
- [ ] `npm run migration:run` **e** `npm run migration:run:test` executam e criam `typeorm_migrations` — conferido nos **dois** bancos com `\dt`

**Banco**
- [ ] `synchronize: false` e `migrationsRun` ausente/false nos **dois** DataSources
- [ ] `migrationsTableName: 'typeorm_migrations'` nos dois — sem assimetria
- [ ] `migrations` por caminho relativo ao **arquivo** (decisão 9)
- [ ] O DataSource do CLI usa import **relativo** do barril — provado rodando `migration:generate --name=probe` e apagando o arquivo gerado (decisão 2b)
- [ ] `logging: false` explícito nos dois (decisão 14)
- [ ] Nenhuma entity, nenhuma migration criada nesta sprint
- [ ] `NODE_ENV=test` seleciona `POSTGRES_DB_TEST` — **provado** afirmando o banco conectado dentro do e2e

**Contrato**
- [ ] Os 5 ramos do filtro implementados e cobertos por spec
- [ ] `details[]` só em 400, com `path` em string
- [ ] Toda mensagem em PT-BR, inclusive as que vêm do Nest (decisão 13)
- [ ] Nenhuma resposta contém nome de constraint, SQL ou stack
- [ ] Todo status fora do catálogo cai em `INTERNAL_ERROR` (decisão 12)

**Arquitetura**
- [ ] Nenhum `getDataSource()` global; quem precisa injeta o token
- [ ] Nenhum `console.log`/`console.error` — `Logger` do Nest
- [ ] Regra de fronteira segue provada: sonda em `services/` continua reprovando
- [ ] Estrutura conforme `PLAN.md §10` — nada fora dela

**Higiene**
- [ ] `dotenv` em `dependencies`, não transitivo
- [ ] Nenhum `TODO`, nenhum arquivo morto (não criar `repositories.ts` vazio)
- [ ] Scores ≥ 9/10 na fricção PÓS; zero CRÍTICO e zero ALTO em aberto
- [ ] `PRODUCT.md §roadmap`: linha 01.02 → ✅
<!-- /§checklist -->

---

<!-- §scores -->
## Scores de fricção

| Agente | Fase | Score | Severidade máxima | Observação |
| --- | --- | --- | --- | --- |
| `[Database]` | PRÉ | **7/10 → 9/10** | ALTO (2) | REJECTED na 1ª passada: migrations nunca alcançariam `prontomed_test` (falha diferida para F2) e o DataSource do CLI usaria `@/`, que o CLI não resolve. Re-scorado após 2b, 3b, 10b, 14 |
| `[Backend]` | PRÉ | **8/10 → 9/10** | ALTO (1) | Ambiguidade entre §escopo #11 e decisão 5 sobre reimplementar ou configurar o pipe. Resolvida por verificação do `nestjs-zod`; `repositories.ts` vazio cortado |
| `[Produto]` | PRÉ | **7/10 → 9/10** | ALTO (2) | REJECTED: `code` indefinido para `HttpException` fora do catálogo e 404 devolvendo `Cannot GET` em inglês. Re-scorado após 11, 12, 13 |
| `[Backend]` | PÓS | /10 | | |
| `[Produto]` | PÓS | /10 | | |
| `[QA]` | PÓS | /10 | | ramos do filtro, determinismo, gate de fechamento de fase |

**Conflitos entre agentes:** nenhum. Os 5 ALTO foram independentes.

> A fricção PRÉ reprovou a **primeira versão deste doc**, não o código — que ainda não
> existe. Os 5 ALTO foram corrigidos no plano; 3 deles (10b, 12, 13) eram falha
> diferida, que só apareceria em F2 ou na mão do avaliador.
<!-- /§scores -->

---

<!-- §issues -->
## Issues encontrados durante a implementação

| # | Descoberta | Causa raiz | Solução | Arquivos | Virou |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

> Preencher **durante** a sprint, não no fechamento.
> Herdado de 01.01: o `prontomed_test` existia sem consumidor — as decisões 10 e 10b
> desta sprint fecham aquela ressalva.
<!-- /§issues -->
