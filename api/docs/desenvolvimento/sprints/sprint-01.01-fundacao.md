# Sprint 01.01 — Fundação da API (F0 de PLAN.md §13)

> Sumário:
> - §objetivo — o projeto sobe com um comando e responde `/api/health`
> - §decisoes — 12 decisões de execução, com alternativa descartada (8–10 na fricção PRÉ, 11–12 na PÓS)
> - §nomes — containers, portas, rede, banco, rota e alias fixados antes de codar
> - §escopo — 26 passos ordenados por dependência: config → docker → src → teste
> - §edge-cases — 8 casos não-óbvios, incluindo dois que só explodem em sprints futuras
> - §checklist — o gate pré-fechamento, todo executado e com evidência
> - §scores — fricção PRÉ e PÓS, por agente, com as duas ressalvas que 01.02 herda
> - §issues — 17 achados: 1–2 na leitura, 3–7 na fricção PRÉ, 8–13 com o comando rodando, 14–17 na fricção PÓS (16–17 saíram de comparar com a referência técnica)
>
> **Plano canônico:** [PLAN.md §13 — F0](../../PLAN.md) · **Estado:** [PRODUCT.md §roadmap](../../PRODUCT.md) · **Formato:** [SPRINT-TEMPLATE.md](../../SPRINT-TEMPLATE.md)

**Branch:** `main` · **Início:** 2026-08-06 · **Fase:** F0
**Status:** ✅ verde — fechada em 2026-08-06 (`lint` · `typecheck` · `build` · `test` · `test:e2e`)
**Triagem:** COMPLEXO (26 arquivos, decisão de fundação) → plano + fricção PRÉ ≥9/10 + aprovação + implementar + fricção PÓS
**Agentes:** `[Backend]` `[Produto]` (no limite) · `[Seguranca]` `[Database]` `[QA]` (obrigatórios, fora do limite)

---

<!-- §objetivo -->
## Objetivo

Sair de um repositório com sete documentos e zero linha de código para um projeto
NestJS que **sobe com um comando e responde**. Ao fim desta sprint, `docker compose
up -d` levanta a API e o Postgres 16, e `curl localhost:3333/api/health` devolve
`{"status":"ok"}`. Nada de domínio, nada de banco de negócio, nada de autenticação.

O que esta sprint realmente instala não é o healthcheck — é o **enforcement**. O
`tsconfig` strict, a regra de fronteira do ESLint (PLAN Apêndice C) e a validação de
ambiente por Zod entram **antes** do primeiro service existir, porque regra de
arquitetura instalada depois é regra que já foi violada. O `/api/health` é apenas a
prova de que o encanamento inteiro — Docker, Nest, prefixo global, config validada —
está conectado de ponta a ponta.

**Módulos impactados:** nenhum módulo de domínio. Toca `shared/environments/`,
`gateways/http/` (health) e a raiz do repositório.
**Risco principal se falhar:** a regra de fronteira não pegar de fato. Um `.eslintrc`
que existe mas não reprova o import proibido dá falsa sensação de arquitetura
protegida, e o custo aparece em F3–F5, quando já há dezenas de arquivos para
reauditar.
**Gatilhos de ativação dos agentes:** 6+ arquivos → 3 agentes (`[Backend]`,
`[Produto]`) · toca segredo e `.env` → `+[Seguranca]` · toca DDL (`CREATE DATABASE`)
e estratégia de dois bancos → `+[Database]` · fase de `§13` que fecha → `+[QA]`.

**Fora do escopo desta sprint** — o que alguém razoavelmente esperaria aqui:

| Item | Vai para |
| --- | --- |
| `Either`, `DomainError` com `code`, filtro global de exceção, **envelope de erro padrão** (§9.4) | **01.02 (F1)** |
| `ZodValidationPipe` global (`APP_PIPE`) | 01.02 (F1) |
| `DataSource` do TypeORM, `DatabaseModule`, qualquer migration | 01.02 (F1) |
| `@Public()` no health (só faz sentido quando existir `APP_GUARD`) | 02.01 (F2) |
| Swagger em `/api/docs` | 05.01 (F6) |
| GitHub Actions | 05.02 (F7) |

> O "padrão de retorno de mensagens" que motivou esta sprint é **01.02**, não aqui:
> ele depende do `AllExceptionsFilter` e do catálogo de `PLAN.md §9.4`. Em F0 o
> health devolve um objeto literal, sem envelope.
<!-- /§objetivo -->

---

<!-- §decisoes -->
## Decisões de execução

| # | Decisão | Escolha | Rationale | Alternativa descartada |
| --- | --- | --- | --- | --- |
| 1 | Healthcheck sonda o banco? | **Não.** `{ status: 'ok' }` literal | Sondar exigiria injetar `DataSource` num controller — exatamente o import que o Apêndice C proíbe. Banco caído já é denunciado por `migration:run` e por qualquer rota autenticada | `@nestjs/terminus` + `TypeOrmHealthIndicator`: uma dependência e uma violação de fronteira para um endpoint de 5 linhas (PLAN §13 F0) |
| 2 | Cobertura do schema de env | **Apêndice F inteiro desde F0**, incluindo `JWT_SECRET`, `BCRYPT_ROUNDS`, `SEED_*` | Boot falha cedo e com mensagem legível por config faltando, e o schema não é reeditado em F1/F2/F6. Preço declarado: F0 exige variáveis que só F2 consome — o `.env.example` já as traz preenchidas | Schema incremental (só o que a fase usa): três edições futuras do mesmo arquivo e três chances de subir com `undefined` |
| 3 | Regra de fronteira do ESLint | **Instalada em F0**, antes de existir `domains/domain/services/` | Enforcement que chega depois do primeiro service chega depois da primeira violação. O `override` casa por glob e é inerte enquanto a pasta não existe — custo zero | Adiar para F1, junto com o kernel |
| 4 | Watch mode | `nest start --watch`, **sem `-b swc`** | O modo swc do projeto de referência recompila mas não reinicia o processo, exigindo `docker restart` a cada mudança. Numa POC, previsibilidade vale mais que 200 ms de build (PLAN §14.1) | `nest start -b swc --watch` |
| 5 | Onde vive o compose | **Raiz** do repositório, `build.context: ./api` | Espelho da referência técnica (PLAN §10): o compose é global, o projeto Nest é um subdiretório. O CI também só lê `.github/` da raiz | `docker-compose.yml` dentro de `api/` |
| 6 | Banco de teste | **Um container, dois bancos** — `prontomed` e `prontomed_test`, via `db/init-test-db.sh` | Um segundo serviço Postgres só para teste dobra memória e tempo de subida sem isolar nada que dois bancos não isolem | Segundo container `db-prontomed-test` |
| 7 | Acesso à config | **`EnvironmentService` tipado** como fachada sobre `ConfigService`; nada lê `process.env` fora dele | Uma fonte tipada e validada; trocar origem de config depois não vira busca global. Espelha `shared/environments/` da referência técnica (PLAN §10) | `ConfigService.get('X')` espalhado, ou `process.env` cru |
| 8 | Formato do config do ESLint | **Flat config** (`eslint.config.mjs`) + pacote unificado `typescript-eslint@^8`, com `@typescript-eslint/no-restricted-imports` (não a regra base) | ESLint 9 só lê flat config: `.eslintrc.json` faz o `lint` morrer e a regra de fronteira nunca roda. A variante do plugin pega `import type`, que a base ignora | Pinar `eslint@^8.57` e manter `.eslintrc.json`: 1 linha, mas dependência EOL num projeto novo |
| 9 | `jest` sem nenhuma suíte em F0 | **`test: "jest --passWithNoTests"`** | F0 não tem `*.spec.ts` sob `src/` (o único teste é o e2e, que roda por `test:e2e`), e `jest` sem suíte sai com código 1 — o gate "tudo verde" seria inalcançável. Inerte a partir de F1 | Criar um spec de fachada só para o `jest` achar algo: teste que não testa nada é ruído no gate |
| 10 | Credencial do Postgres | **`env_file: [./api/.env]` também no serviço `database`**; nenhum literal no compose | Fonte única: senha trocada no `.env` valia para a api e não para o banco — quebra silenciosa. Preço declarado: `JWT_SECRET` passa a existir no ambiente do container do Postgres (aceitável em POC local, ADR-12) | Literais no compose (Apêndice E original): dois donos do mesmo fato |
| 11 | Nome do banco de teste no init | **`init-test-db.sh`** usando `$POSTGRES_DB_TEST` | Mesma doutrina da nº 10, aplicada ao DDL: o nome tem um dono só, e é o mesmo valor que o `DataSource` de teste lê a partir de F1. Um literal divergiria em silêncio, com sintoma ("banco de teste não existe") longe da causa | `init-test-db.sql` com `CREATE DATABASE prontomed_test` literal: uma linha a menos de ler, um drift a mais para pagar |
| 12 | Ambiente | **Dois eixos:** `NODE_ENV` = `['development','test','production']` (ecossistema) **+** `APP_ENV` = `['dev','hmg','prod']` (projeto), default `dev` | Padrão da referência técnica. `NODE_ENV` não é nosso: Express e libs ramificam nos literais, e o Jest injeta `test`. `APP_ENV` carrega a semântica do projeto e é a chave certa para trava fail-closed (seed de F6 só em `dev`). Nome em inglês por ADR-13 — a referência usa `AMBIENTE` por ser projeto PT-BR; os valores ficam, são vocabulário de domínio | Um eixo só: `['dev','test','hmg','prod']` em `NODE_ENV` — funcionava, mas conflacionava duas coisas e desligava em silêncio o que o ecossistema faz com `production` |

> Nenhuma destas decisões muda agregado, invariante ou contrato — **nenhuma vira ADR**.
> As de nº 1, 4 e 6 já estão registradas como nota no `PLAN.md`; aqui ficam com a
> alternativa explícita, que o plano não carrega. As de nº 8, 9 e 10 nasceram na
> **fricção PRÉ**, corrigem o `PLAN.md` e já foram aplicadas nele (§issues 3–5).
<!-- /§decisoes -->

---

<!-- §nomes -->
## Nomes fixados

Convenção: código e banco em **inglês**; banco `snake_case` (ADR-13). F0 não cria
tabela, coluna nem constraint — os nomes abaixo são de infraestrutura e de rota.

| Tipo | Nome | Onde | Descrição |
| --- | --- | --- | --- |
| Container | `api-prontomed` | compose | API Nest, `nest start --watch` |
| Container | `db-prontomed` | compose | `postgres:16-alpine` |
| Imagem | `api-prontomed` | compose | build de `./api/Dockerfile.dev` |
| Rede | `prontomed-net` | compose | bridge, os dois serviços |
| Volume | `pgdata` | compose | dados do Postgres |
| Porta | `3333` | api | host ⇄ container |
| Porta | `5433` → `5432` | database | **host 5433**, container 5432 — 5432 do host fica com outro stack Postgres da máquina (issue 9) |
| Banco | `prontomed` | Postgres | desenvolvimento |
| Banco | `prontomed_test` | Postgres | criado por `db/init-test-db.sh`, a partir de `POSTGRES_DB_TEST` |
| Role | `prontomed` | Postgres | owner dos dois bancos |
| Host interno | `database` | compose | `POSTGRES_HOST` dentro da rede |
| Prefixo HTTP | `api` | `main.ts` | `setGlobalPrefix('api')` |
| Rota | `GET /api/health` | `health.controller.ts` | resposta `{ "status": "ok" }`, 200 |
| Alias TS | `@/*` → `src/*` | `tsconfig` + jest | `paths` e `moduleNameMapper` |
| Tabela de migration | `typeorm_migrations` | (F1) | fixado aqui para não divergir depois |

> A regra de 30 caracteres do template MAPA **não se aplica** neste projeto.
<!-- /§nomes -->

---

<!-- §escopo -->
## Escopo — plano ordenado

Todo caminho parte de `api/`, exceto os marcados **RAIZ**.
Ordem: configuração → Docker → código → teste.

| # | Ação | Arquivo | Tipo | Depende de |
| --- | --- | --- | --- | --- |
| 1 | Criar | `package.json` — deps do Apêndice A, scripts de §14.2 (`test` com `--passWithNoTests`), bloco `jest` do Apêndice D | NOVO | — |
| 2 | Criar | `tsconfig.json` — Apêndice B (strict, `paths` `@/*`) | NOVO | — |
| 3 | Criar | `tsconfig.build.json` — exclui `test/` e `*.spec.ts` do build | NOVO | 2 |
| 4 | Criar | `nest-cli.json` — `sourceRoot: src`, `deleteOutDir: true` | NOVO | — |
| 5 | Criar | `eslint.config.mjs` — Apêndice C (**flat config**, regra de fronteira) + `eslint-config-prettier` | NOVO | 2 |
| 6 | Criar | `.prettierrc` | NOVO | — |
| 7 | Criar | `.env.example` — Apêndice F | NOVO | — |
| 8 | Criar | `.env` (local, fora do git) — `JWT_SECRET` **gerado** por `openssl rand -base64 48`, não copiado do exemplo | NOVO | 7 |
| 9 | Criar | `.dockerignore` — `node_modules`, `dist`, `coverage`, `.env*`, `docs/` (inteiro: 20 MB de `referencia_tecnica` + PDF) | NOVO | — |
| 10 | **Rodar** | `npm install` no host → **`package-lock.json` comitado**; sem lock o `npm ci` do Dockerfile aborta | NOVO | 1 |
| 11 | Criar | `Dockerfile.dev` — Apêndice E (`node:22-alpine`) | NOVO | 10 |
| 12 | Criar | `db/init-test-db.sh` — `CREATE DATABASE "$POSTGRES_DB_TEST"`, fonte única com o `.env` | NOVO | — |
| 13 | Criar | **RAIZ** `docker-compose.yml` — Apêndice E, com `env_file` **nos dois** serviços | NOVO | 11, 12 |
| 14 | Criar | `src/shared/environments/environment.ts` — schema Zod + tipo inferido | NOVO | 2 |
| 15 | Criar | `src/shared/environments/environment.service.ts` — fachada tipada | NOVO | 14 |
| 16 | Criar | `src/shared/environments/environment.module.ts` — `@Global`, exporta o service | NOVO | 15 |
| 17 | Criar | `src/gateways/http/controllers/core/health.controller.ts` | NOVO | — |
| 18 | Criar | `src/gateways/http/controllers/core/index.ts` — barril | NOVO | 17 |
| 19 | Criar | `src/gateways/http/http.module.ts` — declara os controllers | NOVO | 18 |
| 20 | Criar | `src/app.module.ts` — `ConfigModule.forRoot({ isGlobal, validate })` + `EnvironmentModule` + `HttpModule` | NOVO | 16, 19 |
| 21 | Criar | `src/main.ts` — `NestFactory`, `setGlobalPrefix('api')`, `listen(PORT, '0.0.0.0')` | NOVO | 20 |
| 22 | Criar | `test/jest-e2e.json` — Apêndice D | NOVO | 1 |
| 23 | Criar | `test/integration/health.e2e-spec.ts` — supertest em `GET /api/health` | NOVO | 21, 22 |
| 24 | Alterar | `README.md` — bloco "como subir" (`cp .env.example .env` + `npm install` + `up -d`) | EXISTENTE | 13 |
| 25 | Verificar | **RAIZ** `.gitignore` — já cobre `node_modules/`, `dist/`, `.env`, `coverage/` | — | — |
| 26 | Criar | `src/shared/environments/environment.spec.ts` — coerção de tipo + edge cases 1 e 2 + "erro não imprime o valor" | NOVO (fricção PÓS) | 14 |

> **Item 26 nasceu na fricção PÓS**, por achado de `[QA]`: os edge cases 1 e 2 e o
> item de segurança "a mensagem não imprime o valor" estavam verificados **à mão**,
> sem regressão. São quatro asserções e tornam o `--passWithNoTests` uma rede, não
> uma muleta — `npm test` agora roda suíte de verdade.

> **O `up` de F0 são três comandos, não um.** `cp api/.env.example api/.env` →
> `cd api && npm install` → `docker compose up -d`. O `.env` é gitignorado e o
> compose o exige por `env_file`; sem ele o compose falha antes de subir container
> algum. Isso vai para o `README.md` agora (passo 24), não em F7.

### Migrations

Nenhuma. F0 não cria tabela, coluna nem constraint. O único DDL da sprint é o
`CREATE DATABASE` de `db/init-test-db.sh`, executado uma vez pelo entrypoint do
container — não é migration e não entra em `typeorm_migrations`.

**Commits sugeridos** (PLAN §13 F0): `chore: bootstrap do projeto nestjs` ·
`chore: eslint com regra de fronteira de camadas` · `chore: ambiente docker com postgres 16` ·
`feat: healthcheck da api`

> O quarto commit de `PLAN.md §13` diz "healthcheck **com verificação de banco**".
> A decisão nº 1 desta sprint tira a verificação de banco — a mensagem foi ajustada
> para `feat: healthcheck da api`. Divergência registrada em §issues.
<!-- /§escopo -->

---

<!-- §edge-cases -->
## Edge cases

| # | Caso | Comportamento esperado | Coberto por |
| --- | --- | --- | --- |
| 1 | `.env` ausente ou variável faltando no boot | Processo **morre no start** com a lista de campos inválidos, legível. Nunca sobe com `undefined` | `ConfigModule.forRoot({ validate })` com o schema Zod |
| 2 | `JWT_SECRET` com menos de 32 caracteres | Falha na validação de boot já em F0, mesmo sem nada consumir JWT ainda (decisão nº 2) | schema Zod (`.min(32)`) |
| 3 | `POSTGRES_HOST` difere dentro e fora do container (`database` × `localhost`) | O compose sobrescreve via `environment:`; `npm run` na máquina usa o `.env` com `localhost`. Os dois caminhos funcionam sem editar arquivo | Apêndice E + `.env.example` |
| 4 | API sobe antes do Postgres aceitar conexão | API espera; não há crash-loop | `depends_on: { database: { condition: service_healthy } }` + `pg_isready` |
| 5 | `prontomed_test` não existe apesar do `init-test-db.sh` | O entrypoint do Postgres só roda `/docker-entrypoint-initdb.d/` no **primeiro** boot do volume. Volume pré-existente ignora o script | `docker compose down -v` antes de subir. **Documentar no README** |
| 6 | Volume bind `./api:/usr/src/app` sobrepõe o `node_modules` da imagem | O volume anônimo `/usr/src/app/node_modules` preserva o do container. Instalar dependência nova exige `docker compose up -d --build` | Apêndice E |
| 7 | **Cruzado com F2:** `APP_GUARD` global passa a exigir token e derruba `/api/health` | Quando 02.01 registrar o `JwtAuthGuard`, o health precisa de `@Public()`. O `health.e2e-spec.ts` desta sprint é o detector: ele quebra de 200 para 401 | Item obrigatório do §escopo de 02.01 |
| 8 | `noUnusedLocals` / `noUnusedParameters` com strict | `catch (e)` sem uso e parâmetro decorado não consumido reprovam o build. Parâmetro de construtor com `private readonly` conta como usado | `npm run typecheck` |

> Nenhum edge case de concorrência nem de escopo por médico nesta sprint — não há
> escrita, não há `doctorId`, não há INV-01 nem INV-04 em jogo.
<!-- /§edge-cases -->

---

<!-- §checklist -->
## Checklist anti-erro (pré-fechamento)

Fechado em 2026-08-06. Cada item abaixo foi **executado**, não inspecionado.

**Verde**
- [x] `lint` + `typecheck` + `build` + `test` + `test:e2e` — todos verdes, e re-rodados **depois** de o container escrever `dist/` (issue 10)
- [x] `docker compose down -v` → `up -d --build` → `curl localhost:3333/api/health` → `{"status":"ok"}` · HTTP 200
- [x] `package-lock.json` comitável (371 KB, não gitignorado); a imagem foi construída do zero pelo `npm ci`
- [x] `down -v && up -d` recria `prontomed_test` — confirmado por `pg_database` (edge case 5)

**Arquitetura**
- [x] Regra de fronteira **provada** com arquivo-sonda sob `services/`: 2 erros, um por padrão proibido. Sonda removida
- [x] A sonda usou `import type { Repository } from 'typeorm'` — reprovado. É o caso que a regra **base** deixaria passar; a do plugin pegou (decisão nº 8)
- [x] `@/*` resolve nos três lugares, e no **runtime**: `nest build` reescreve `@/app.module` → `require("./app.module")`, e `node dist/main.js` sobe (issue 11)
- [x] Estrutura conforme `PLAN.md §10` — 8 arquivos em `src/`, nada fora
- [x] Nenhum `Repository<T>`, `DataSource` ou `typeorm` em controller (não há sequer a dependência em uso)

**Banco**
- [x] `init-test-db.sh` cria só o banco de `POSTGRES_DB_TEST`, owner `POSTGRES_USER` — conferido no `pg_database`
- [x] Zero `synchronize` / `migrationsRun` no repositório — varredura em `src`, `test` e compose
- [x] Nenhuma entity, nenhuma migration nesta sprint

**Segurança**
- [x] `git check-ignore api/.env` → `api/.env`
- [x] `.env.example` só com placeholder; `JWT_SECRET` obviamente falso
- [x] `.env` local com segredo de 64 chars gerado por `openssl rand -base64 48`
- [x] `.env` **ausente da imagem** (conferido por `ls` dentro do container); `.env.example` presente; `docs/` fora (20 MB a menos). Em runtime o bind monta o `.env` de qualquer forma — a garantia é sobre a imagem
- [x] Erro de validação nomeia o campo e **não** o valor — coberto por asserção automatizada, não por leitura (`environment.spec.ts`)

**Contrato**
- [x] `GET /api/health` → 200 `{"status":"ok"}`; `GET /health` → 404. Ambos no e2e e no `curl`
- [x] Uma única rota mapeada — confirmado no `RoutesResolver` do boot

**Higiene**
- [x] Zero `console.log`, `TODO`, `FIXME`; zero scaffold de `nest new`
- [x] Scripts de `§14.2` com os nomes exatos e `typeorm-ts-node-commonjs`
- [x] Scores ≥ 9/10 na fricção PÓS; zero CRÍTICO e zero ALTO em aberto
- [x] `PRODUCT.md §roadmap`: linha 01.01 → ✅
<!-- /§checklist -->

---

<!-- §scores -->
## Scores de fricção

| Agente | Fase | Score | Severidade máxima | Observação |
| --- | --- | --- | --- | --- |
| `[Backend]` | PRÉ | **7/10 → 9/10** | ALTO (3) | REPROVADO na 1ª passada: `.eslintrc.json` inerte no ESLint 9, `npm test` vermelho por ausência de suíte, `npm ci` sem lock. Re-scorado após A–C |
| `[Seguranca]` | PRÉ | **8/10** | MÉDIO | APROVADO_COM_RESSALVAS: credencial do Postgres duplicada, `.env` nascido do placeholder, escopo real do `.dockerignore`. Zero CRÍTICO |
| `[Database]` | PRÉ | **9/10** | MÉDIO | APPROVED_WITH_NOTES: nenhum objeto de schema na fase; `up` de clone limpo falhava por `.env` ausente |
| `[Backend]` | PÓS | **9/10** | MÉDIO | APROVADO. Camadas limpas, fronteira provada (inclusive `import type`), DI mínima. Não é 10: a PÓS achou três defeitos reais no código como escrito — `dist` root-owned, alias `@/` nunca exercitado, lint e `tsc` discordando (issues 10–12). Todos corrigidos |
| `[Produto]` | PÓS | **9/10** | MÉDIO | APROVADO com ressalva. `GET /api/health` → 200 `{"status":"ok"}`; `/health` → 404; uma rota só; `@ApiTags`/`@ApiOperation`/`@ApiOkResponse` já no controller para F6. **Ressalva:** o health devolve objeto literal, e em 01.02 ele passa a ser o único endpoint fora do envelope padrão de `§9.4` — decisão consciente a tomar em F1, não a descobrir |
| `[QA]` | PÓS | **9/10** | MÉDIO | APROVADO. 6 asserções, zero data/random/rede/banco — determinismo por construção. O e2e do prefixo é também o detector do `APP_GUARD` de 02.01. Achado que virou item 26 do §escopo: os edge cases 1 e 2 estavam verificados à mão. **Ressalva:** a existência de `prontomed_test` segue sem teste automatizado — só é testável a partir de 01.02, quando existir `DataSource` |

**Conflitos entre agentes e como foram resolvidos:** nenhum. Os três achados ALTO
foram de `[Backend]` e não colidiram com veto de nível 1–3.

**Correções aprovadas na fricção PRÉ (A–G, 2026-08-06):** A flat config · B
`--passWithNoTests` · C `package-lock.json` comitado · D `env_file` no `database` ·
E `JWT_SECRET` gerado · F bloco "como subir" no README · G `.dockerignore` cobre
`docs/` + `listen(port,'0.0.0.0')`.

> Fricção PRÉ obrigatória: a triagem é COMPLEXO. Sem score registrado, não se implementa.
<!-- /§scores -->

---

<!-- §issues -->
## Issues encontrados durante a implementação

| # | Descoberta | Causa raiz | Solução | Arquivos | Virou |
| --- | --- | --- | --- | --- | --- |
| 1 | `CLAUDE.md` declara branch `main`; o repositório está em `master` | Doc escrita antes do primeiro commit | Decidir qual é a canônica e alinhar os dois | `CLAUDE.md` | — |
| 2 | `PLAN.md §13 F0` sugere o commit `feat: healthcheck com verificacao de banco`, mas a nota da própria fase proíbe sondar o banco | Contradição interna do plano | Mensagem ajustada para `feat: healthcheck da api`; nota de correção no próprio `PLAN.md §13 F0` | `PLAN.md` | — |
| 3 | `PLAN.md` Apêndice C especifica `.eslintrc.json`, que o ESLint 9 **não lê** — `npm run lint` morre com "Could not find config file" e a regra de fronteira (o entregável real de F0) nunca roda | Apêndice escrito no formato eslintrc, anterior ao flat config | Apêndice C reescrito em flat config (`eslint.config.mjs`) com `typescript-eslint@^8` e `@typescript-eslint/no-restricted-imports` — a variante do plugin pega `import type`, que a base ignora | `PLAN.md` Ap. A e C | decisão nº 8 |
| 4 | `npm test` fecharia **vermelho** em F0: nenhum `*.spec.ts` sob `src/` e `jest` sem suíte sai com código 1 — o gate "tudo verde" era inalcançável | Apêndice D presume specs que só existem a partir de F1 | `"test": "jest --passWithNoTests"` em `PLAN.md §14.2`, com o porquê declarado | `PLAN.md §14.2` | decisão nº 9 |
| 5 | `Dockerfile.dev` roda `npm ci`, que **exige** `package-lock.json` — inexistente num repositório sem `npm install` prévio. Primeiro `up --build` de clone limpo abortava | Apêndice E copiado de projeto já com lock comitado | Passo 10 do §escopo: `npm install` no host + lock comitado; pré-condição documentada no Apêndice E e em `§13 F0` | `PLAN.md` Ap. E e §13 | decisão de escopo |
| 6 | Apêndice E fixava `POSTGRES_USER/PASSWORD/DB` literais no compose enquanto a api lia de `./api/.env`: senha trocada no `.env` quebrava a conexão em silêncio | Dois donos do mesmo fato — viola a regra de fonte única do repositório | `env_file: [./api/.env]` também no `database`, literais removidos, healthcheck com `$$POSTGRES_USER`/`$$POSTGRES_DB` | `PLAN.md` Ap. E | decisão nº 10 |
| 7 | Critério de pronto "clone limpo → `docker compose up -d`" era falso: `.env` é gitignorado e o compose o exige por `env_file` | O `cp .env.example .env` não estava em lugar nenhum (README é F7) | Bloco "como subir" no `api/README.md` já em F0 (passo 24) + pré-condição no Apêndice E | `api/README.md`, `PLAN.md` | — |
| 8 | `npm test` rodou **71 suítes** e falhou em 64: o `rootDir: "."` do Apêndice D alcança `api/docs/referencia_tecnica`, o projeto de referência vendorizado | `testRegex` sem `roots`: o escopo do jest era o diretório inteiro, não o código do projeto. `collectCoverageFrom` estava escopado e mascarava o problema | `"roots": ["<rootDir>/src"]` no bloco `jest`; `"roots": ["<rootDir>/test"]` no `jest-e2e.json`. Corrigido também no `PLAN.md` Apêndice D | `package.json`, `test/jest-e2e.json`, `PLAN.md` | — |
| 9 | `docker compose up -d` abortou: porta 5432 do host já alocada por outro container Postgres que roda na mesma máquina | Ambiente compartilhado — o projeto de referência técnica está no ar | Host passa a expor **5433**; `POSTGRES_PORT=5433` no `.env`, com o compose sobrescrevendo para 5432 dentro da rede. **O ganho não é só destravar o boot:** com 5432 no `.env`, um `migration:run` do host acertaria o banco do *outro* projeto | `docker-compose.yml`, `.env*`, `PLAN.md` §14.1 e Ap. E/F, §nomes | — |
| 10 | `npm run build` no host falhou com `EACCES` em `dist/`; `rm -rf dist` também — nem o dono do repositório conseguia limpar | O container roda como **root** e escreve `dist/` no bind mount `./api:/usr/src/app`. A 1ª tentativa (volume anônimo em `dist`) trocou o defeito por outro: `deleteOutDir: true` faz `rmdir` no ponto de montagem e o boot morre com `EBUSY` | `chown -R node:node` + `USER node` no `Dockerfile.dev` (uid 1000, o mesmo do host); volume anônimo só para `node_modules`. Ambas as armadilhas documentadas no `PLAN.md` Ap. E | `Dockerfile.dev`, `docker-compose.yml`, `PLAN.md` | — |
| 11 | O alias `@/*` estava configurado e **nunca exercitado em `src/`** — só no e2e, via `moduleNameMapper` do Jest, que não prova o runtime | Item de checklist marcável por inspeção: nada quebraria até o 1º import `@/` em F1 | Verificado empiricamente: `nest build` reescreve `@/app.module` para `require("./app.module")` no `dist/`, e `node dist/main.js` sobe. `app.module.ts` e `main.ts` passam a usar `@/` em import cross-layer | `src/main.ts`, `src/app.module.ts` | — |
| 12 | O lint reprovou o idioma `const { X: _omitted, ...resto }` do novo spec, que o `tsc` aceita | `@typescript-eslint/no-unused-vars` do preset `recommended` sem `ignoreRestSiblings` nem `^_` — lint e typecheck discordando sobre o mesmo código | Bloco de regras gerais no `eslint.config.mjs` alinhando os dois (`argsIgnorePattern`, `varsIgnorePattern`, `caughtErrorsIgnorePattern`, `ignoreRestSiblings`). Serve também ao edge case 8, que previa esta fricção em `catch (e)` e parâmetro decorado | `eslint.config.mjs` | — |

| 13 | `NODE_ENV` passou a `['dev','hmg','prod']` e **todo e2e parou de subir**, além de 1 spec | O Jest injeta `NODE_ENV=test` em `process.env`, que vence o `.env` no `ConfigModule`. Não era ajustável por arquivo: nenhum valor de `.env` salva, porque quem decide é o runner | Enum vira `['dev','test','hmg','prod']` — `test` é ambiente de execução real, não valor decorativo. Dois testes de regressão travam a constraint. `.env*` e `PLAN.md` Ap. F alinhados. **Estado intermediário — superado pelo issue 17** | `environment.ts`, `environment.spec.ts`, `.env*`, `PLAN.md` | — |

| 14 | `POSTGRES_DB_TEST` tinha dois donos: o schema Zod/`.env` e o literal `prontomed_test` dentro do `init-test-db.sql` | A mesma classe do issue 6 — corrigida para credenciais na fricção PRÉ e deixada passar aqui. Achada só na fricção PÓS de `[Seguranca]`/`[Database]` | `init-test-db.sh` usando `$POSTGRES_DB_TEST`. Falha que seria concreta em 01.02, quando o `DataSource` de teste ler a variável | `db/init-test-db.sh`, `docker-compose.yml`, `PLAN.md`, README | decisão nº 11 |
| 15 | `CLAUDE.md` declarava branch `main` com o repositório em `master` (issue 1, aberto desde antes da sprint) | Doc escrita antes do primeiro commit | `git branch -m master main`. Sem nenhum commit no repositório, o custo é zero e a doc já estava certa | branch do repositório | — |

| 16 | O achado de `[Seguranca]` sobre `JWT_SECRET` no container do Postgres foi levantado **sem checar o compose da referência**, que faz idêntico — `env_file: ./api/.env` no `database` **e** no `redis-cache` | Princípio de menor exposição aplicado sobre um padrão do projeto que eu não tinha lido. Achado válido como princípio, errado como desvio | Nenhuma mudança de código: a decisão nº 10 é o padrão, não a divergência. Registrado para não ser relevantado | — | **`CLAUDE.md §Validação empírica`** |
| 17 | A comparação com o compose da referência (pedida após o issue 16) revelou que ela separa **`AMBIENTE`** de **`NODE_ENV`** — a saída que eu havia descartado como "duas variáveis para uma POC" ao decidir o issue 13 | Decisão tomada por raciocínio próprio sem consultar a referência técnica, que o `CLAUDE.md` declara ser o espelho arquitetural do projeto | Adotado como `APP_ENV` (inglês, ADR-13) com valores `dev/hmg/prod`; `NODE_ENV` volta a `development/test/production`. Três testes de regressão travam os dois eixos | `environment.ts`, `environment.service.ts`, `environment.spec.ts`, `.env*`, `PLAN.md` Ap. F | decisão nº 12 + **`CLAUDE.md §Validação empírica`** e o gatilho de PLC da `referencia_tecnica/` |

> Preencher **durante** a sprint, não no fechamento.
> Issues 3–7 nasceram na **fricção PRÉ** — antes da primeira linha de código, que é
> exatamente onde elas custam menos. As 8 e 9 só apareceram com o comando rodando:
> nenhuma revisão de plano as pegaria, e é por isso que o critério de pronto é
> `curl`, não leitura.
<!-- /§issues -->
