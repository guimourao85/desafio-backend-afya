# Sprint 05.01 — Swagger executável e seed de demonstração (F6 de PLAN.md §13)

> Sumário:
>
> - §objetivo — o que esta sprint entrega e por quê
> - §decisoes — o que foi decidido na execução, com rationale
> - §nomes — identificadores fixados antes de codar
> - §escopo — plano ordenado por dependência
> - §edge-cases — os casos não-óbvios (insumo do [Dominio])
> - §checklist — o gate pré-fechamento
> - §scores — fricção PRÉ e PÓS, por agente
> - §issues — o que apareceu durante a implementação
> - §riscos — situacional: a sprint grava dados de demonstração e expõe credencial
>
> **Plano canônico:** [PLAN.md §13 — F6](../../PLAN.md) · **Estado:** [PRODUCT.md §roadmap](../../PRODUCT.md)

**Branch:** `main` · **Criado em:** 2026-08-10 · **Fase:** F6
**Status:** ⬜ não iniciada
**Agentes acionados:** `[Seguranca]` `[Backend]` `[Produto]` `[QA]`

---

<!-- §objetivo -->

## Objetivo

Depois desta sprint o avaliador **não precisa de curl, nem de Postman, nem de ler
código** para exercitar a API: abre `/api/docs`, faz login, clica em **Authorize**,
e executa todo o fluxo do desafio de dentro do navegador — sobre uma base que já
tem médico, pacientes, consultas e anotações espelhando os wireframes.

É a primeira sprint cujo cliente não é o sistema, é **uma pessoa com pouco tempo**.
Nada aqui muda regra de negócio: muda o que se enxerga do lado de fora e qual é o
estado inicial do banco. O valor é de apresentação, e o custo de errar é
desproporcional — documentação que mente é pior que documentação ausente, porque o
avaliador só descobre a mentira executando.

**Módulos impactados:** `gateways/http/decorators/` (novo) · `gateways/http/controllers/**`
(respostas de erro e parâmetro de caminho) · `infrastructure/.../seeds/demo.seed.ts`
(conteúdo e idempotência) · `test/integration/openapi.e2e-spec.ts` (gate) ·
`RAIZ README.md` (as frases que descrevem o seed).
**Nenhuma entity, nenhuma migration, nenhum service, nenhuma rota nova.**

**Risco principal se falhar:** o seed grava no banco de desenvolvimento. Um seed
não-idempotente que rode duas vezes duplica paciente e colide no índice único
parcial da agenda (INV-01) — o avaliador recebe erro do `npm run seed` e conclui que
a agenda está quebrada. O risco secundário é PII: o seed é o lugar mais fácil do
projeto para alguém colar dado real "só para testar".

**Agentes obrigatórios e por qual gatilho** ([CLAUDE.md §Ativação](../../../../CLAUDE.md)):

| Agente        | Gatilho                                                             | Fora do limite? |
| ------------- | ------------------------------------------------------------------- | --------------- |
| `[Seguranca]` | credencial de demonstração em `.env.example` + PII fictícia gravada  | sim             |
| `[QA]`        | F6 fecha fase (`PLAN.md §13`)                                       | sim             |
| `[Produto]`   | contrato visível: é a sprint que define o que o cliente da API lê    | não (2 de 2)    |
| `[Backend]`   | decorators compostos novos em `gateways/http` — fronteira e reuso    | não (2 de 2)    |

> **`[Database]` não entra.** O gatilho é "migration, orm-entity, constraint" — o
> seed **usa** o schema, não o altera. Se durante a sprint aparecer necessidade de
> coluna ou constraint, é `[DEVOLVE]`: para, e `[Database]` entra fora do limite.

**Fora do escopo desta sprint:**

| Fora                                                          | Onde vai                                                |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| README do avaliador: roteiro de 6 passos, RF/RNF, ER, ADRs     | F7 / sprint 05.02                                       |
| `@ApiProperty` manual em DTO                                   | proibido por ADR-07 — schema sai do Zod                 |
| Seed de carga / volume para teste de performance               | sprint 06.01 (rigor)                                    |
| Versionamento do OpenAPI (`/v1`), export do JSON para arquivo  | não pedido pelo enunciado — corte declarado (decisão 9) |
| Tradução do Swagger UI ou tema customizado                     | ruído de apresentação, `PLAN.md §3.1` corta             |

<!-- /§objetivo -->

---

<!-- §decisoes -->

## Decisões de execução

| #  | Decisão                                  | Escolha                                                                                                                                                        | Rationale                                                                                                                                                                                                                     | Alternativa descartada                                                                                            |
| -- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1  | Onde documentar o 400 de Zod             | **Decorator composto** `@ApiValidationErrorResponse()`, aplicado a toda rota com `@Body()` ou `@Query()`                                                        | O envelope de 400 é **um só** — vem do `AllExceptionsFilter`, não da rota. Repetir o mesmo bloco `schema.example` em onze controllers é drift esperando acontecer                                                               | `@ApiBadRequestResponse` copiado rota a rota; ou um documento global, que não diz **qual** rota valida o quê      |
| 2  | Onde documentar o 401 de sessão          | **Mesmo mecanismo**: `@ApiUnauthorizedErrorResponse()`, aplicado às **treze** rotas com `@ApiBearerAuth`, substituindo o bloco inline que `get-profile` já tem  | `PLAN.md §9.1` declara 401 em quinze rotas e o `JwtAuthGuard` global o devolve; o Swagger mostra em três. Documento que esconde o erro mais provável do avaliador — colar token errado — mente por omissão                     | Deixar como está; ou copiar o bloco em doze controllers, que é a mesma dívida do 400 com outro número              |
| 3  | O 401 de `login` e `refresh` fica onde está | **Não** recebe o decorator: mantém o bloco próprio                                                                                                            | É outro erro com o mesmo status — "credencial inválida" e "refresh revogado", não "sem token". Unificar apagaria a diferença que o avaliador precisa ler                                                                        | Um decorator só para os três — economiza linhas e funde três mensagens distintas numa                              |
| 4  | Escopo do gate do `openapi.e2e-spec`     | Iterar sobre **todas as operações** do documento e cobrar `summary` + ao menos uma resposta com `example`; mais uma asserção sobre a **contagem** de operações  | É o único gate automatizável do "Pronto quando" da fase. Sem ele, "todos os endpoints executam do Swagger" é palavra. A contagem força quem adiciona rota a olhar a anotação: o teste fica vermelho                            | Conferência manual clicando no `/api/docs` — que não sobrevive à próxima rota                                      |
| 5  | A sonda de teste dentro do gate          | O documento do gate é montado com **`AppModule` puro**. As asserções sobre `ProbeDto` ficam num describe separado, que continua registrando o `ProbeController` | `ProbeController` é fixture de `test/`: tem `summary` e nenhuma resposta com `example`. Dentro do gate ele reprova uma rota que não existe na API, e a saída fácil é abrir exceção — gate com exceção é gate sem dente          | Anotar a sonda com um exemplo (documentar mentira nova); ou lista de exceção no gate                               |
| 6  | Ano das consultas do seed                | **Fixo**: `SEED_YEAR` para as concluídas, `SEED_YEAR + 1` para a próxima. Nunca `new Date()`                                                                    | Seed que muda de resultado conforme o dia em que roda quebra o roteiro do README (F7) e qualquer asserção sobre ele. O `+1` mantém a próxima consulta no futuro sem reintroduzir data relativa                                  | Datas relativas a "hoje" — legíveis, e não reproduzíveis                                                           |
| 7  | Como o seed monta os agregados           | Pelas **portas** (`PATIENTS_REPOSITORY`, `APPOINTMENTS_REPOSITORY`) e por `Appointment.addNote()`. Estado inicial vai no literal; `complete()` **não** é chamado | `addNote()` é a **única fábrica** de `ConsultationNote` (INV-05) — um seed que a contorna é o primeiro cliente a provar que a invariante é opcional. Já `complete()` guarda uma **transição**, e o seed não transita: declara estado inicial | `insert` cru nas três tabelas — mais curto, e fura INV-05 no arquivo mais copiado do projeto                       |
| 8  | Idempotência do seed                     | **Guarda por existência do médico demo**: se já existe, não insere nada, loga o motivo e sai **0**                                                              | `TRUNCATE` num banco de desenvolvimento apaga o trabalho manual de quem estava testando. Colisão silenciosa no índice de INV-01 é pior ainda (§edge-cases 1)                                                                    | `TRUNCATE CASCADE` antes de inserir; ou `upsert` por CPF — que exige uma unicidade que `patients` não tem          |
| 9  | Versionar o OpenAPI / exportar JSON      | **Não** — corte declarado                                                                                                                                      | `PLAN.md §3.1`: o avaliador entende em uma passada? Um `/v1` sem segunda versão é cerimônia                                                                                                                                      | `/api/v1/docs` + `openapi.json` comitado                                                                          |
| 10 | `@ApiParam` nas rotas de caminho         | **Sim**, nas oito rotas com `:id` — executado depois do gate                                                                                                   | O Swagger já publica o parâmetro; falta a descrição que diz **de quê** é o id — paciente numa rota de `appointments`, consulta em outra. Barato, e some do radar se não for agendado                                            | Tratar como bloqueante e gastar rigor onde não há risco                                                           |
| 11 | Fronteira do README entre 05.01 e 05.02  | **Esta sprint corrige o que ela invalida**: as frases que descrevem o comportamento do `seed` e as contagens de teste. A 05.02 escreve as seções do avaliador   | O checklist de fechamento cobra o README de quem muda o que o avaliador vê ([SPRINT-TEMPLATE.md §checklist](../../SPRINT-TEMPLATE.md)). Empurrar para a sprint seguinte é exatamente como um README envelhece                   | Deixar todo o README para a 05.02 — que o encontraria descrevendo um seed que não existe mais                      |

> Nenhuma destas decisões muda arquitetura, agregado ou contrato de domínio — **não
> há ADR nesta sprint**, e nenhuma nasce como débito.

<!-- /§decisoes -->

---

<!-- §nomes -->

## Nomes fixados

**Definir ANTES de codar.** Convenção: código e banco em **inglês**; mensagem ao
usuário em PT-BR (ADR-13).

| Tipo      | Nome                                         | Onde                        | Descrição                                                    |
| --------- | -------------------------------------------- | --------------------------- | ------------------------------------------------------------- |
| Decorator | `ApiValidationErrorResponse`                 | `gateways/http/decorators/` | 400 do `ZodError`, com envelope e `details[]` (decisão 1)     |
| Arquivo   | `api-validation-error.decorator.ts`          | `gateways/http/decorators/` | —                                                              |
| Decorator | `ApiUnauthorizedErrorResponse`               | `gateways/http/decorators/` | 401 de token ausente, inválido ou expirado (decisão 2)        |
| Arquivo   | `api-unauthorized-error.decorator.ts`        | `gateways/http/decorators/` | —                                                              |
| Constante | `SEED_YEAR`                                  | `demo.seed.ts`              | Ano das consultas concluídas; a próxima usa `SEED_YEAR + 1`   |
| Constante | `EXPECTED_OPERATION_COUNT`                   | `openapi.e2e-spec.ts`       | Operações esperadas no documento da aplicação (decisão 4)     |
| Env       | `SEED_DOCTOR_EMAIL` · `SEED_DOCTOR_PASSWORD` | `.env.example`              | Já existem: `medico@prontomed.dev` / `prontomed123`           |
| Tag       | `autenticação` · `pacientes` · `agendamentos` · `health` | controllers     | Já existem — PT-BR minúsculo (ADR-13), congeladas              |

**Dados de demonstração** — espelham os wireframes (`PLAN.md §2`). Instantes em UTC,
como o schema da borda exige:

| Paciente | Consulta                                  | Estado      | Anotação |
| -------- | ----------------------------------------- | ----------- | -------- |
| Pedro    | `SEED_YEAR`-01-01 T09:00:00.000Z          | `COMPLETED` | uma      |
| Pedro    | `SEED_YEAR + 1`-05-15 T14:00:00.000Z      | `SCHEDULED` | —        |
| Eduardo  | `SEED_YEAR`-02-10 T10:30:00.000Z          | `COMPLETED` | uma      |
| Bruno    | nenhuma                                   | —           | —        |

> **Bruno existe de propósito.** Paciente sem histórico é o caso que a linha do tempo
> precisa saber mostrar (§edge-cases 8), e ninguém cria à mão para conferir.

> Nomes, CPFs e telefones são **fictícios e sintéticos**. CPF de seed usa dígito
> verificador válido em faixa reconhecidamente de teste; nenhum dado real entra aqui,
> nem "só para ver funcionando" (§riscos).

<!-- /§nomes -->

---

<!-- §escopo -->

## Escopo — plano ordenado

**Ordem importa.** Todo caminho parte de `api/` (PLAN §10), exceto `RAIZ`.

| #  | Ação   | Arquivo                                                                                  | Tipo  | Depende de |
| -- | ------ | ------------------------------------------------------------------------------------------ | ----- | ---------- |
| 1  | Criar  | `src/gateways/http/decorators/api-validation-error.decorator.ts`                            | NOVO  | —          |
| 2  | Criar  | `src/gateways/http/decorators/api-unauthorized-error.decorator.ts`                          | NOVO  | —          |
| 3  | Editar | os **onze** controllers com `@Body()` ou `@Query()` — aplicar o decorator de #1              | ALTER | 1          |
| 4  | Editar | os **treze** controllers com `@ApiBearerAuth` — aplicar o decorator de #2; remover o bloco 401 inline de `get-profile` | ALTER | 2 |
| 5  | Editar | `test/integration/openapi.e2e-spec.ts` — gate de operações e separação da sonda (decisões 4 e 5) | ALTER | 3, 4  |
| 6  | Editar | as **oito** rotas com parâmetro de caminho — `@ApiParam` (decisão 10)                        | ALTER | 5          |
| 7  | Editar | `src/infrastructure/databases/typeorm/postgres/seeds/demo.seed.ts` — pacientes, consultas, anotações e guarda de idempotência | ALTER | — |
| 8  | Editar | `RAIZ README.md` — as frases que descrevem o `seed` e as contagens de teste (decisão 11)     | ALTER | 7          |
| 9  | Rodar  | `lint` · `typecheck` · `build` · `test` · `test:e2e`                                         | —     | 1-8        |
| 10 | Manual | banco recriado (`docker compose down -v` → `up -d` → `migration:run`) → `npm run seed` → `npm run seed` de novo → `/api/docs` → login → Authorize → executar **todo** endpoint | — | 9 |

**Controllers do passo 3** (`@Body()` ou `@Query()`): `authenticate-doctor` ·
`refresh-session` · `revoke-session` · `register-patient` · `update-patient` ·
`list-patients` · `schedule-appointment` · `update-appointment` ·
`list-appointments` · `add-consultation-note` · `get-patient-timeline`.

**Controllers do passo 4** (`@ApiBearerAuth`): os cinco de `patients`, os seis de
`appointments`, `get-patient-timeline` e `get-profile`. Ficam de fora `health`,
`authenticate-doctor`, `refresh-session` e `revoke-session` — são as públicas, e as
duas primeiras têm 401 próprio (decisão 3).

**Rotas do passo 6** (parâmetro de caminho): `get-patient` · `update-patient` ·
`anonymize-patient` · `get-appointment` · `update-appointment` ·
`cancel-appointment` · `add-consultation-note` · `get-patient-timeline`.

### Migrations

**Nenhuma.** Esta sprint não toca schema — é o que mantém `[Database]` fora da
ativação (§objetivo). Necessidade de migration durante a execução é `[DEVOLVE]`.

<!-- /§escopo -->

---

<!-- §edge-cases -->

## Edge cases

| #  | Caso                                                                   | Comportamento esperado                                                                                                        | Coberto por                      |
| -- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1  | `npm run seed` rodado duas vezes                                       | 2ª execução não insere nada, loga o motivo e sai **0**; nunca colide em INV-01 nem duplica paciente                             | guarda de existência (decisão 8) |
| 2  | `npm run seed` com `APP_ENV` != `dev`                                  | recusa e sai com erro explicando — comportamento já existente, a preservar                                                     | guarda de ambiente do seed       |
| 3  | `npm run seed` antes de `migration:run`                                | falha com erro de tabela inexistente, legível — não silencioso                                                                 | passo 10 do §escopo              |
| 4  | Seed roda no banco de **teste** e destrói fixture de e2e               | impossível: o seed é dev-only (caso 2) e o e2e roda com `NODE_ENV=test` contra `prontomed_test`                                | caso 2 + `migration:run:test`    |
| 5  | Rota nova entra depois desta sprint sem anotação OpenAPI               | `openapi.e2e-spec` **reprova** — por `summary`/`example` ausentes ou pela contagem de operações                                | decisão 4, passo 5               |
| 6  | Avaliador marca consulta no mesmo instante da consulta próxima do seed | 409 com envelope `SCHEDULE_CONFLICT` — é o **roteiro pretendido**, não um bug                                                  | seed + `schedule-appointment`    |
| 7  | Documento OpenAPI declara resposta que o código não produz             | reprovado em `[Produto]` na fricção PÓS — é o risco central da sprint                                                          | revisão manual, rota a rota      |
| 8  | Bruno, sem consulta → `GET /api/patients/:id/appointments`             | 200 com página vazia, nunca 404                                                                                               | contrato da 04.02 + passo 10     |
| 9  | Anotação em consulta `COMPLETED` no seed × guarda de estado da entity  | **aceita.** `addNote()` guarda com `isActive()` — só a cancelada recusa, porque o atendimento que ela descreveria não aconteceu | `Appointment.addNote()` (INV-05) |
| 10 | Avaliador chama rota protegida sem clicar em **Authorize**             | 401 com envelope `UNAUTHENTICATED`, **documentado no Swagger** — é o erro mais provável da avaliação                            | decisão 2, passo 4               |

> **Não há caso de paciente anonimizado nesta sprint.** Pedro, Eduardo e Bruno nascem
> ativos (§nomes), e o seed não exercita INV-02.

<!-- /§edge-cases -->

---

<!-- §checklist -->

## Checklist anti-erro (pré-fechamento)

**Verde**

- [ ] `npm run lint && npm run typecheck && npm run build && npm test && npm run test:e2e` — todos verdes
- [ ] "Pronto quando" de F6 satisfeito **à mão**: logar → Authorize → executar **todos** os endpoints do `/api/docs`

**Contrato**

- [ ] Zero `@ApiProperty` manual — schema sai do Zod (ADR-07)
- [ ] Toda rota com `@Body()` ou `@Query()` documenta o 400 via `@ApiValidationErrorResponse()`
- [ ] Toda rota com `@ApiBearerAuth` documenta o 401 via `@ApiUnauthorizedErrorResponse()`
- [ ] `PLAN.md §9.1` reconferido contra `/api/docs-json`: cada erro declarado na tabela aparece no documento, e vice-versa
- [ ] Toda rota com parâmetro de caminho tem `@ApiParam` dizendo **de quê** é o id
- [ ] Todo exemplo de resposta bate com o que o código **realmente** devolve (edge case 7)
- [ ] Envelope de erro dos exemplos conforme `PLAN.md §9.4`
- [ ] Mensagens em PT-BR; tags inalteradas

**Seed**

- [ ] Idempotente: roda 2× sem duplicar, sem colidir em INV-01 e saindo 0
- [ ] Dev-only preservado; nenhuma credencial nova fora de `.env.example`
- [ ] Zero PII real; datas determinísticas (`SEED_YEAR`)
- [ ] Anotação criada por `Appointment.addNote()`, nunca por `insert` em `consultation_notes` (INV-05)
- [ ] Estado inicial permite demonstrar RF-01…RF-06 sem criar nada à mão, exceto o 409

**Higiene**

- [ ] Nenhum `console.log`, nenhum `TODO`, nenhum arquivo morto
- [ ] `openapi.e2e-spec` reprova rota sem `summary` ou sem exemplo — **e foi visto reprovando**
- [ ] As contagens deste doc (onze rotas de borda, treze com bearer, oito com `:id`, operações do documento) conferidas contra o código na abertura
- [ ] Scores ≥ 9/10 na fricção PÓS; zero CRÍTICO e zero ALTO em aberto
- [ ] `RAIZ README.md` sem nenhuma frase descrevendo o seed antigo (decisão 11)
- [ ] Docs: `PRODUCT.md §roadmap` (estado 05.01)

<!-- /§checklist -->

---

<!-- §scores -->

## Scores de fricção

| Agente        | Fase | Score | Severidade máxima | Observação |
| ------------- | ---- | ----- | ----------------- | ---------- |
| `[Produto]`   | PRÉ  | /10   |                   |            |
| `[Seguranca]` | PRÉ  | /10   |                   |            |
| `[Produto]`   | PÓS  | /10   |                   |            |
| `[Backend]`   | PÓS  | /10   |                   |            |
| `[QA]`        | PÓS  | /10   |                   |            |

**Conflitos entre agentes e como foram resolvidos:**

<!-- /§scores -->

---

<!-- §issues -->

## Issues encontrados durante a implementação

| # | Descoberta | Causa raiz | Solução | Arquivos | Virou |
| - | ---------- | ---------- | ------- | -------- | ----- |
|   |            |            |         |          |       |

<!-- /§issues -->

---

<!-- §riscos -->

## Riscos e mitigações

| Risco                                                        | Impacto                                                             | Mitigação                                                                                        | Sinal de que aconteceu                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Dado pessoal **real** entrar no seed                         | PII versionada no git, irreversível na prática                      | Nomes do wireframe apenas; CPF sintético; revisão de `[Seguranca]` no diff do seed                 | CPF ou telefone que não bate com a lista de §nomes   |
| Credencial demo em `.env.example` lida como segredo vazado   | Falso positivo em varredura de segredo (F7)                         | Placeholder de ambiente dev-only, e o seed recusa fora de `APP_ENV=dev`. Registrar como **aceito**  | Varredura acusando `prontomed123`                   |
| Exemplo de resposta divergindo do código                     | Documentação que mente — pior que ausente                           | Edge case 7 + revisão rota a rota em `[Produto]` PÓS                                               | Avaliador executa no Swagger e recebe outro payload |
| Seed duplicando dado por rodar 2×                            | Erro no `npm run seed`; avaliador conclui que a agenda está quebrada | Decisão 8 (guarda por existência) + edge case 1, exercitado no passo 10                            | Segunda execução falhando em vez de sair limpa      |
| Gate do `openapi.e2e-spec` nascer verde sem provar nada      | Sensação de cobertura; a próxima rota sem anotação passa            | Ver o gate **reprovando** antes de dá-lo por pronto (checklist §higiene)                           | Gate verde antes de os passos 3 e 4 terminarem      |

<!-- /§riscos -->
