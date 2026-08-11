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
**Status:** ✅ fechada em 10/08/2026 — gates verdes, F6 verificada à mão nas 17 rotas
(§checklist). Cinco issues, todas resolvidas; duas viraram **acréscimo ao `§escopo`**
(passos 6' e 7'), uma corrigiu um fato errado no `PLAN.md §9.1`.
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
| Seed de carga / volume para teste de performance               | fora de escopo — nenhum requisito pede desempenho       |
| Versionamento do OpenAPI (`/v1`), export do JSON para arquivo  | não pedido pelo enunciado — corte declarado (decisão 9) |
| Tradução do Swagger UI ou tema customizado                     | ruído de apresentação, `PLAN.md §3.1` corta             |

<!-- /§objetivo -->

---

<!-- §decisoes -->

## Decisões de execução

| #  | Decisão                                  | Escolha                                                                                                                                                        | Rationale                                                                                                                                                                                                                     | Alternativa descartada                                                                                            |
| -- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1  | Onde documentar o 400 de Zod             | **Decorator composto** `@ApiValidationErrorResponse()`, aplicado a **toda rota que o pipe global valida** — `@Body()`, `@Query()` **ou `@Param()`**: são **quinze**, não onze | O envelope de 400 é **um só** — vem do `AllExceptionsFilter`, não da rota. Repetir o mesmo bloco `schema.example` em quinze controllers é drift esperando acontecer | `@ApiBadRequestResponse` copiado rota a rota; ou um documento global, que não diz **qual** rota valida o quê      |
| 1' | O 400 tem **duas** formas, e o decorator precisa das duas | `@ApiValidationErrorResponse()` (sem argumento) nas quatro rotas de param puro; **com** `details[]` nas outras onze. **A assinatura mudou na implementação** — o `§nomes` previa `{ withDetails: false }`; o porquê está no §issues 5 | **Achado ALTO do `[Produto]` na fricção PRÉ.** `GET /api/patients/nao-e-uuid` → `400`, e **sem `details`** — não há campo de formulário a apontar. ⚠️ **A causa escrita aqui está errada e foi corrigida no §issues 2**: não é o `ZodValidationPipe` global que valida `@Param`, é o `ParseUUIDPipe` de cada rota. O efeito — quinze rotas, duas formas — continua exato. Um exemplo único documentaria uma forma e mentiria na outra, que é o **edge case 7**, o risco central desta sprint. Verificado ao vivo em 10/08/2026 nas duas formas | Um exemplo só, com `details` — mente em 4 de 15 rotas; ou dois decorators separados, que duplicam o envelope que a decisão 1 existe para unificar |
| 2  | Onde documentar o 401 de sessão          | **Mesmo mecanismo**: `@ApiUnauthorizedErrorResponse()`, aplicado às **treze** rotas com `@ApiBearerAuth`, substituindo o bloco inline que `get-profile` já tem  | `PLAN.md §9.1` declara 401 em quinze rotas e o `JwtAuthGuard` global o devolve; o Swagger mostra em três. Documento que esconde o erro mais provável do avaliador — colar token errado — mente por omissão                     | Deixar como está; ou copiar o bloco em doze controllers, que é a mesma dívida do 400 com outro número              |
| 3  | O 401 de `login` e `refresh` fica onde está | **Não** recebe o decorator: mantém o bloco próprio                                                                                                            | É outro erro com o mesmo status — "credencial inválida" e "refresh revogado", não "sem token". Unificar apagaria a diferença que o avaliador precisa ler                                                                        | Um decorator só para os três — economiza linhas e funde três mensagens distintas numa                              |
| 4  | Escopo do gate do `openapi.e2e-spec`     | Iterar sobre **todas as operações** do documento e cobrar `summary` + ao menos uma resposta com `example`; mais uma asserção sobre a **contagem** de operações  | É o único gate automatizável do "Pronto quando" da fase. Sem ele, "todos os endpoints executam do Swagger" é palavra. A contagem força quem adiciona rota a olhar a anotação: o teste fica vermelho                            | Conferência manual clicando no `/api/docs` — que não sobrevive à próxima rota                                      |
| 5  | A sonda de teste dentro do gate          | O documento do gate é montado com **`AppModule` puro**. As asserções sobre `ProbeDto` ficam num describe separado, que continua registrando o `ProbeController` | `ProbeController` é fixture de `test/`: tem `summary` e nenhuma resposta com `example`. Dentro do gate ele reprova uma rota que não existe na API, e a saída fácil é abrir exceção — gate com exceção é gate sem dente          | Anotar a sonda com um exemplo (documentar mentira nova); ou lista de exceção no gate                               |
| 6  | Ano das consultas do seed                | **Fixo**: `SEED_YEAR` para as concluídas, `SEED_YEAR + 1` para a próxima. Nunca `new Date()`. **A "próxima" é a mais recente da linha do tempo, não necessariamente uma data futura** | Seed que muda de resultado conforme o dia em que roda quebra o roteiro do README (F7) e qualquer asserção sobre ele. **Corrigido na fricção PRÉ (MÉDIO do `[Produto]`):** este campo dizia que o `+1` "mantém a próxima consulta no futuro" — falso para qualquer valor fixo assim que o tempo passa. Nada quebra, porque `schemas/domain/appointment.schema.ts:31-33` aceita data passada **de propósito** ("registrar atendimento retroativo é caso real de prontuário"), e o edge case 6 (409 em cima dela) independe do ano. O que o `+1` entrega é **ordem determinística** na timeline, que é o que RF-06 demonstra | Datas relativas a "hoje" — legíveis, e não reproduzíveis; ou `SEED_YEAR` derivado do ano corrente, que reintroduz exatamente a não-determinismo que esta decisão corta |
| 7  | Como o seed monta os agregados           | Pelas **portas** (`PATIENTS_REPOSITORY`, `APPOINTMENTS_REPOSITORY`) e por `Appointment.addNote()`. Estado inicial vai no literal; `complete()` **não** é chamado | `addNote()` é a **única fábrica** de `ConsultationNote` (INV-05) — um seed que a contorna é o primeiro cliente a provar que a invariante é opcional. Já `complete()` guarda uma **transição**, e o seed não transita: declara estado inicial | `insert` cru nas três tabelas — mais curto, e fura INV-05 no arquivo mais copiado do projeto                       |
| 8  | Idempotência do seed                     | **Guarda por existência do médico demo, para os dados de demonstração**: se já existe, não insere paciente, consulta nem anotação, loga o motivo e sai **0**. A **reconfirmação de credencial** do seed atual — reescrever o hash quando o médico já existe (`demo.seed.ts:71-81`) — é **preservada** | `TRUNCATE` num banco de desenvolvimento apaga o trabalho manual de quem estava testando. Colisão silenciosa no índice de INV-01 é pior ainda (§edge-cases 1). **Ressalva da auditoria de 10/08:** a leitura literal de "não insere nada e sai 0" derrubaria `seed.e2e-spec.ts:71` ("reconfirma a senha do `.env` sobre um hash antigo") e quebraria a promessa que a tabela de scripts do README já publica — a guarda governa a **inserção de dados demo**, não o upsert do hash | `TRUNCATE CASCADE` antes de inserir; ou `upsert` por CPF — que exige uma unicidade que `patients` não tem          |
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
| Constante | `SEED_YEAR`                                  | `demo.seed.ts`              | **`2026`** — ano das concluídas; a próxima usa `SEED_YEAR + 1` (2027). Literal, nunca derivado de `new Date()` |
| Constante | `EXPECTED_OPERATION_COUNT`                   | `openapi.e2e-spec.ts`       | **17** — operações do documento da aplicação (decisão 4). Medido em `/api/docs-json` na fricção PRÉ; esta sprint **não** cria rota, então o valor não muda |
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

**PII de cada paciente — fixada aqui, não improvisada no código.** São exatamente as
colunas que `patients` tem:

| Campo       | Pedro                    | Eduardo                    | Bruno                    | **Marina** (só exemplo)  |
| ----------- | ------------------------ | -------------------------- | ------------------------ | ------------------------ |
| `name`      | Pedro Álvares            | Eduardo Ramos              | Bruno Teixeira           | Marina Duarte            |
| `phone`     | (11) 90000-0001          | (11) 90000-0002            | (11) 90000-0003          | (11) 90000-0004          |
| `email`     | pedro@example.com        | eduardo@example.com        | bruno@example.com        | marina@example.com       |
| `birthDate` | 1987-03-12               | 1975-11-04                 | 1994-06-23               | 1990-04-18               |
| `sex`       | `MALE`                   | `MALE`                     | `MALE`                   | `FEMALE`                 |
| `heightM`   | 1.68                     | 1.81                       | 1.74                     | 1.62                     |
| `weightKg`  | 75                       | 92.4                       | 68                       | 58.5                     |

> **Marina entrou na fricção PÓS, e o motivo é o próprio `§riscos`.** Ela não é do
> seed: é a PII do **exemplo de corpo** de `POST /api/patients` no Swagger (issue 3),
> e só chega ao banco se o avaliador clicar em **Execute**. O sinal do `§riscos` é
> "qualquer valor que não esteja nesta tabela", e o exemplo o disparava — a escolha
> era fixar o valor aqui ou afrouxar o controle. Mesma faixa `9000X` e mesmo domínio
> `example.com` dos outros três. `FEMALE` de propósito: os três do seed são `MALE`, e
> o exemplo é o único lugar onde o outro valor do enum aparece executável.

> **Corrigido na fricção PRÉ** (MÉDIO do `[Seguranca]`, BAIXO do `[Produto]`). Este
> bloco dizia *"nomes, CPFs e telefones são fictícios; CPF de seed usa dígito
> verificador válido em faixa de teste"* — e **`patients` não tem coluna `cpf`**
> (`doctor_id, name, phone, email, birth_date, sex, height_m, weight_kg,
> anonymized_at`). O controle protegia um campo inexistente enquanto os seis campos
> de PII que existem ficavam sem valor fixado, para serem inventados na hora de codar.
> Telefones em faixa `9000X` e domínio `example.com` (RFC 2606) são reconhecidamente
> não-roteáveis. Nenhum dado real entra aqui, nem "só para ver funcionando" (§riscos).

> **`SEED_YEAR = 2026`, e o valor tem prazo.** Com 2026 as duas concluídas caem no
> passado (01/01 e 10/02) e a agendada em 15/05/2027 fica no futuro — a agenda lê
> coerente para quem avaliar em 2026. **Isso envelhece:** avaliado em 2028, a
> "próxima" está no passado. Não é bug (a decisão 6 já declara que o `+1` entrega
> **ordem**, não futuro; e `schemas/domain/appointment.schema.ts:31-33` aceita data passada de
> propósito), e o conserto é trocar um literal. Fica declarado em vez de descoberto.

**Conteúdo das duas anotações** — texto integral, não "uma anotação":

| Consulta | `content` |
| -------- | --------- |
| Pedro, `SEED_YEAR`-01-01   | `Paciente relatou vermelhidão na pele do antebraço esquerdo, sem prurido. Orientado uso de hidratante e retorno em 30 dias se persistir.` |
| Eduardo, `SEED_YEAR`-02-10 | `Consulta de rotina. Pressão arterial dentro da faixa esperada. Solicitados exames laboratoriais de rotina para o retorno.` |

> **Fixado na mesma fricção que criou a exigência.** O `§checklist` passou a cobrar
> *"os valores gravados são exatamente os da tabela de PII do `§nomes`"* — e a
> anotação, que é o campo de texto livre **mais sensível da sprint** (é o objeto
> inteiro do DEBT-01), era o único que ficava para ser inventado na hora de codar.
> Checklist que cobra uma tabela incompleta é checklist que não fecha.

<!-- /§nomes -->

---

<!-- §escopo -->

## Escopo — plano ordenado

**Ordem importa.** Todo caminho parte de `api/` (PLAN §10), exceto `RAIZ`.

| #  | Ação   | Arquivo                                                                                  | Tipo  | Depende de |
| -- | ------ | ------------------------------------------------------------------------------------------ | ----- | ---------- |
| 1  | Criar  | `src/gateways/http/decorators/api-validation-error.decorator.ts`                            | NOVO  | —          |
| 2  | Criar  | `src/gateways/http/decorators/api-unauthorized-error.decorator.ts`                          | NOVO  | —          |
| 3  | Editar | os **quinze** controllers que o pipe global valida — aplicar o decorator de #1, com `details[]` nos onze de borda e **sem** nos quatro de param puro (decisões 1 e 1') | ALTER | 1          |
| 4  | Editar | os **treze** controllers com `@ApiBearerAuth` — aplicar o decorator de #2; remover o bloco 401 inline de `get-profile` | ALTER | 2 |
| 5  | Editar | `test/integration/openapi.e2e-spec.ts` — gate de operações e separação da sonda (decisões 4 e 5) | ALTER | 3, 4  |
| 6  | Editar | as **oito** rotas com parâmetro de caminho — `@ApiParam` (decisão 10)                        | ALTER | 5          |
| 6' | Editar | as **oito** rotas com corpo — `@ApiBody({ type, examples })`, para o Execute funcionar de primeira (**acréscimo**, issue 3) | ALTER | 5 |
| 7  | Editar | `src/infrastructure/databases/typeorm/postgres/seeds/demo.seed.ts` — pacientes, consultas, anotações e guarda de idempotência | ALTER | — |
| 7' | Editar | `test/integration/seed.e2e-spec.ts` — as promessas que o passo 7 acrescentou: os três pacientes, a PII do `§nomes`, as três consultas com suas anotações, Bruno sem nenhuma e as datas fixas (**acréscimo**) | ALTER | 7 |
| 8  | Editar | `RAIZ README.md` — as frases que descrevem o `seed`; contagens de teste corrigidas em **absoluto**, contra a saída real de `npm test` e `npm run test:e2e` no fechamento (decisão 11). O README **já está defasado antes desta sprint**: diz 139 casos / 9 suítes de integração, e `test/integration/` tem **10** — a `seed.e2e-spec.ts` entrou no fim da 04.02 | ALTER | 7          |
| 9  | Rodar  | `lint` · `typecheck` · `build` · `test` · `test:e2e`                                         | —     | 1-8        |
| 10 | Manual | banco recriado (`docker compose down -v` → `up -d` → `migration:run`) → `npm run seed` → `npm run seed` de novo → `/api/docs` → login → Authorize → executar **todo** endpoint | — | 9 |
| 11 | Editar | `api/docs/PRODUCT.md` §roadmap — estado da 05.01 para ✅; e este sub-doc (`§scores` PÓS, `§issues`) | ALTER | 10 |

**Controllers do passo 3 — quinze**, conferidos contra o código na fricção PRÉ de
10/08/2026:

- **Onze com `@Body()` ou `@Query()`**, exemplo **com** `details[]`:
  `authenticate-doctor` · `refresh-session` · `revoke-session` · `register-patient` ·
  `update-patient` · `list-patients` · `schedule-appointment` · `update-appointment` ·
  `list-appointments` · `add-consultation-note` · `get-patient-timeline`.
- **Quatro só com `@Param()`**, exemplo **sem** `details[]` (decisão 1'):
  `get-patient` · `anonymize-patient` · `get-appointment` · `cancel-appointment`.

> Os outros quatro dos oito com `@Param()` — `update-patient`, `update-appointment`,
> `add-consultation-note`, `get-patient-timeline` — já estão na primeira lista por
> terem body ou query, e recebem a forma **com** `details[]`. 11 ∪ 8 = **15**.

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

- [x] `npm run lint && npm run typecheck && npm run build && npm test && npm run test:e2e` — todos verdes: **133 unitários / 21 suítes** e **153 de integração / 10 suítes**, em 10/08/2026
- [x] "Pronto quando" de F6 satisfeito **à mão**: banco recriado do zero → `migration:run` → `seed` → login → as **17 rotas** exercitadas, mais o 409 do horário ocupado, o 201 no slot liberado pelo cancelamento, a anonimização LGPD e o refresh revogado. Todos os status bateram com o documentado

**Contrato**

- [x] Zero `@ApiProperty` manual — schema sai do Zod (ADR-07). Os `@ApiBody` do passo 6' passam `type`, e o documento publica `$ref: RegisterPatientDto` com os exemplos ao lado, conferido em `/api/docs-json`
- [x] As **quinze** rotas que o pipe global valida documentam o 400 via `@ApiValidationErrorResponse()` — e as quatro de param puro usam a forma **sem `details`** (decisão 1'). Conferido no documento: 11 com `details`, 4 sem, e são exatamente as quatro de `:id`
- [x] Toda rota com `@ApiBearerAuth` documenta o 401 via `@ApiUnauthorizedErrorResponse()` — 13 de 13, e o gate reprova se uma parar de documentar
- [x] `PLAN.md §9.1` reconferido contra `/api/docs-json`: as 17 linhas batem status a status, nos dois sentidos
- [x] Toda rota com parâmetro de caminho tem `@ApiParam` dizendo **de quê** é o id — 8 de 8, e a distinção paciente × consulta está explícita nas duas rotas onde ela confunde
- [x] Todo exemplo de resposta bate com o que o código **realmente** devolve (edge case 7) — cada `details[]` foi **copiado de uma resposta real** obtida por `curl` antes de virar exemplo
- [x] Envelope de erro dos exemplos conforme `PLAN.md §9.4`
- [x] Mensagens em PT-BR; tags inalteradas

**Seed**

- [x] Idempotente: roda 2× sem duplicar, sem colidir em INV-01 e saindo 0 — provado nos dois lugares: `seed.e2e-spec.ts` (3 execuções, contagem das **quatro** tabelas) e à mão, com `docker compose down -v` antes (`1/3/3/2` depois de duas execuções, `exit=0` nas duas)
- [x] Dev-only preservado; nenhuma credencial nova fora de `.env.example` — `demo.seed.ts` lança se `!environment.isDevelopment`; credenciais seguem em `SEED_DOCTOR_EMAIL`/`SEED_DOCTOR_PASSWORD`
- [x] Zero PII real; datas determinísticas (`SEED_YEAR = 2026`, literal) — nenhum `new Date()` decide dado gravado
- [x] Os valores gravados são **exatamente** os da tabela de PII do `§nomes` — conferido no banco, campo a campo, com `psql`
- [x] Nenhum `logger` do seed carrega nome, telefone, email ou **conteúdo de anotação** — só ID (`review-security.md §verifica` item 3)
- [x] Anotação criada por `Appointment.addNote()`, nunca por `insert` em `consultation_notes` (INV-05)
- [x] Estado inicial permite demonstrar RF-01…RF-06 sem criar nada à mão, exceto o 409

**Higiene**

- [x] Nenhum `console.log`, nenhum `TODO`, nenhum arquivo morto — varrido em `src/` e `test/`
- [x] `openapi.e2e-spec` reprova rota sem `summary` ou sem exemplo — **visto reprovando por mutação deliberada**: `summary` e exemplo removidos do `health`, decorator de 401 removido do `get-profile`, três testes vermelhos **nomeando as rotas culpadas**, tudo restaurado e verde de novo
- [x] As contagens deste doc (onze rotas de borda, treze com bearer, oito com `:id`, 17 operações) conferidas contra o código: **todas corretas**
- [x] Scores ≥ 9/10 na fricção PÓS; zero CRÍTICO e zero ALTO em aberto
- [x] `RAIZ README.md` sem nenhuma frase descrevendo o seed antigo (decisão 11)
- [x] Docs: `PRODUCT.md §roadmap` (estado 05.01 ✅) e `PLAN.md §9.1` (causa do 400 de `:id` corrigida, issue 2)

<!-- /§checklist -->

---

<!-- §scores -->

## Scores de fricção

| Agente        | Fase | Score | Severidade máxima | Observação |
| ------------- | ---- | ----- | ----------------- | ---------- |
| `[Produto]`   | PRÉ  | **9/10** (7/10 antes da correção) | **ALTO (3), resolvidos no doc** | (1) O passo 3 aplicava o decorator de 400 só às rotas com `@Body()`/`@Query()`, mas o `ZodValidationPipe` é `APP_PIPE` **global** e valida `@Param` — `get-patient`, `get-appointment`, `anonymize-patient` e `cancel-appointment` devolvem 400 e ficariam sem documentar, e o próprio checklist ("e vice-versa" contra o `§9.1`) reprovaria a sprint → decisão 1, quinze rotas. (2) O 400 tem **duas formas** (com e sem `details`); exemplo único mente em 4 de 15, que é o edge case 7 → decisão 1'. (3) `PRODUCT.md §regras` prometia `"Dados inválidos."` e o código responde `"Requisição inválida."` — copiar o exemplo do `§regras`, que é o procedimento certo, produziria Swagger mentindo → **o código vence** (decisão do usuário, 10/08/2026), `§regras` corrigido. MÉDIO: a rationale da decisão 6 prometia "próxima consulta no futuro", impossível com ano fixo → reescrita. As três contagens do `§escopo` (11, 13, 8) conferidas contra o código: **corretas** |
| `[Seguranca]` | PRÉ  | **9/10** | MÉDIO (1), resolvido no doc | O `§nomes` e o `§riscos` protegiam um **CPF que `patients` não tem**, enquanto os sete campos de PII que a tabela realmente tem ficavam sem valor fixado — controle não observável, e a PII do seed seria inventada na hora de codar. Corrigido: tabela de PII por paciente no `§nomes`, sinal do `§riscos` reescrito sobre campos que existem. Confirmado sem achado: seed fail-closed por `APP_ENV` (`demo.seed.ts:49`), log por ID e nunca por email, nenhuma rota nova, nenhum `@Public()` novo, decorator de 401 publica envelope e não conteúdo. Declarado e aceito, não reaberto: `SEED_DOCTOR_PASSWORD` com valor real no `.env.example` (o `§riscos` já o registra; o `JWT_SECRET` ao lado é placeholder de verdade). Para a PÓS: o passo 7 passa a gravar `content` de anotação — virou item de checklist |
| `[Backend]`   | PRÉ  | /10   |                   | **Pendente — rodar antes do passo 1.** A ativação (§objetivo) o exige pelos decorators compostos novos em `gateways/http`; sem esta linha, contexto limpo não distinguia adiamento deliberado de esquecimento (achado da auditoria de 10/08). A mesma auditoria já conferiu as premissas mecânicas: contagens 15/11/4/13/8/17 corretas contra o código, e as portas do seed existem (`PatientRepository.create` · `AppointmentRepository.create`/`appendNotes`) |
| `[Produto]`   | PÓS  | **9/10** | MÉDIO (1), corrigido | O documento foi conferido **rota a rota contra respostas reais**, não contra o plano: todo `details[]` publicado saiu de um `curl` executado antes de virar exemplo, e as 17 linhas do `§9.1` batem com `/api/docs-json` nos dois sentidos. **MÉDIO, corrigido durante a implementação (issue 3):** o "Pronto quando" da fase é *executar todos os endpoints do Swagger*, e `POST /api/patients` respondia **400 no Execute default** — o Swagger UI monta o corpo pelo schema e produz `birthDate: "8063-81-66"`, que casa com o `pattern` e não é data. Nenhum gate pegava: as 286 suítes batem no HTTP direto e nunca veem o corpo que a UI monta. Verificado **no browser**, corrigido com `@ApiBody({ examples })` nas oito rotas com corpo, e reverificado no browser. Sem achado sobre mensagem: tudo em PT-BR, tags congeladas |
| `[Seguranca]` | PÓS  | **9/10** | MÉDIO (1), resolvido no doc | Confirmado no diff e no banco: log do seed por **ID** nas quatro saídas, nunca email, nome, telefone ou conteúdo de anotação; PII gravada idêntica à tabela do `§nomes`, conferida com `psql` campo a campo; fail-closed por `APP_ENV` intacto; nenhuma rota nova, nenhum `@Public()` novo; os decorators publicam **envelope**, nunca conteúdo. **MÉDIO:** os exemplos de corpo introduziram uma quarta pessoa fictícia (Marina) fora da tabela do `§nomes`, e o sinal do `§riscos` é literalmente "valor que não está na tabela" — resolvido fixando-a lá, em vez de afrouxar o controle. **Declarado e aceito, agora com superfície a mais:** `prontomed123` passa a aparecer também no `/api/docs-json`, e não só no `.env.example`. É credencial de ambiente dev-only, o seed recusa fora de `APP_ENV=dev` e não há build de produção (ADR-12) — mas a varredura de segredo da F7 vai encontrá-la em um lugar novo |
| `[Backend]`   | PÓS  | **9/10** | BAIXO (1), aceito | Os dois decorators vivem em `gateways/http/decorators/`, dependem só de `@nestjs/common` e `@nestjs/swagger`, e não conhecem service, ORM nem domínio — a fronteira do `CLAUDE.md §Arquitetura` continua de pé, e o `lint` (que restringe import em `controllers/**`) passa. Nenhum controller ganhou lógica: só anotação. `ReturnType<typeof applyDecorators>` como retorno, em vez de `MethodDecorator & ClassDecorator` escrito à mão, para o tipo seguir a lib. **BAIXO:** o 400 continua tendo **duas** fontes — `ZodValidationPipe` para corpo e query, `ParseUUIDPipe` por rota para `:id` —, e a segunda é opt-in: rota `:id` nova que esqueça o pipe devolve 500, não 400. Não vira débito porque o gate do documento e o `§9.1` já cobram o 400 declarado; fica registrado no docblock do decorator, que é onde quem for escrever a próxima rota vai ler |
| `[QA]`        | PÓS  | **9/10** | BAIXO (1), declarado | **153 e2e / 10 suítes** e **133 unitários / 21 suítes**, verdes. O gate novo foi **visto reprovando** por mutação deliberada (não nasceu verde por construção, que era o risco declarado), e reprova nomeando a rota culpada. As cinco asserções novas do seed cobrem promessa, não implementação: os três pacientes, a PII exata do `§nomes`, as três consultas com a contagem de anotações de cada uma, Bruno sem nenhuma, e as datas fixas. A idempotência passou a contar as **quatro** tabelas, não só `doctors` — é a consulta que traz o risco real de repetição (INV-01). **BAIXO:** o Execute default do Swagger UI não tem gate automatizado — foi verificado no browser, com Playwright, e nada impede uma rota futura de nascer com corpo default inválido |

**Conflitos entre agentes e como foram resolvidos:**

Nenhum entre agentes. Houve **um entre a doc e o código** (ALTO 3 do `[Produto]`), e
ele não se resolve por hierarquia: `PRODUCT.md §regras` é fonte única sobre mensagem
ao usuário, e estava errada há cinco sprints. Decidido pelo usuário em 10/08/2026 —
**o código vence**, mesmo precedente da decisão 1 desta sprint para as tags. O
`§regras` foi corrigido, e ganhou linha própria para o 400 de `:id` malformado, que
nunca esteve lá.

> **O que a PRÉ pegou e por que ela existe.** Os três ALTO vêm da mesma raiz: o plano
> raciocinou sobre validação **por rota** (`@Body`, `@Query`) num projeto onde o pipe
> é **global** desde a F1. Nenhum deles apareceria antes de codar sem alguém executar
> `curl /api/patients/nao-e-uuid` — e depois de codar cada um seria retrabalho em 4
> controllers, 4 linhas do `§9.1` e um decorator já escrito com a assinatura errada.

<!-- /§scores -->

---

<!-- §issues -->

## Issues encontrados durante a implementação

| # | Descoberta | Causa raiz | Solução | Arquivos | Virou |
| - | ---------- | ---------- | ------- | -------- | ----- |
| 1 | **A idempotência do seed (parte do passo 7) foi implementada antes da fricção PRÉ desta sprint**, e o registro dela foi parar no `§issues` da sprint **04.02** — sprint fechada, fase F5, código de F6 | O achado nasceu ao rodar `npm run seed` durante o fechamento da sprint 04, e foi anotado no sub-doc que estava aberto em vez do sub-doc a que o código pertence. Mesmo padrão do extinto `04.03`: trabalho real encaixado no doc mais próximo, não no certo | Registrado aqui, com ponteiro para [sprint-04.02 §issues 9](sprint-04.02-anotacoes.md), que fica onde está — o achado não muda de lugar, ganha endereço. A fricção PRÉ desta sprint roda **depois** do fato e cobre o que já entrou | `demo.seed.ts` · `test/integration/seed.e2e-spec.ts` | achado de governança |
| 2 | **A causa do 400 nas rotas de `:id` está errada na fricção PRÉ, no `§decisoes` (1') e no `PLAN.md §9.1`** — e o efeito documentado está certo | A PRÉ concluiu "o `ZodValidationPipe` é global e valida `@Param`". Não valida: ele devolve o valor intocado quando o metatype não é `ZodDto` (`nestjs-zod/dist/index.js:944-947`), e o de `@Param('id')` é `String`. Quem recusa é o **`ParseUUIDPipe`**, declarado rota a rota. O achado nasceu de `curl`, que mostra a **resposta** e não o pipe | `PLAN.md §9.1` corrigido com a causa real e a consequência operacional: rota `:id` **sem** `ParseUUIDPipe` não devolve 400 nenhum — manda texto cru ao Postgres e volta 500. O docblock do decorator carrega a mesma correção, que é onde a próxima rota vai lê-la. As quinze rotas e as duas formas do envelope seguem valendo | `PLAN.md §9.1` · `api-validation-error.decorator.ts` | correção de fato no plano |
| 3 | **`POST /api/patients` respondia 400 no botão Execute do Swagger**, com o corpo que a própria UI monta | Nenhum DTO tem `example`, então o Swagger UI gera o corpo a partir do schema: `birthDate: "8063-81-66"` **casa com o `pattern`** `^\d{4}-\d{2}-\d{2}$` e não é uma data, e o `.refine` recusa. As 286 suítes passam verdes porque batem no HTTP direto e nunca veem esse corpo. **O `[Produto]` PRÉ não tinha como pegar**: só aparece no browser | `@ApiBody({ type, examples })` nas **oito** rotas com corpo — o schema continua saindo do Zod (`$ref` preservado, ADR-07), entra só o exemplo. Ganho lateral: a credencial do seed vem preenchida no login, e `POST /appointments` ganhou o exemplo do **409** apontando o horário que o seed ocupa. Verificado no browser antes e depois | os 8 controllers com `@Body()` | **acréscimo ao `§escopo`** (passo 6') |
| 4 | **`revoke-session` já tinha um `@ApiBadRequestResponse` inline**, e o passo 3 mandava aplicar o decorator "às quinze rotas" sem dizer o que fazer com ele | O passo 4 previu a remoção do bloco inline do `get-profile` (401) e o passo 3 não previu o equivalente para o 400 — o único bloco de 400 inline do projeto, escrito na 02.01 | Substituído, como o `get-profile`. O que era próprio daquela rota — "o 204 tolerante vale para o **token**, não para o payload" — sobreviveu na `description` do decorator, que existe exatamente para isso | `revoke-session.controller.ts` | resolvido na hora |
| 5 | **A assinatura do decorator de 400 saiu diferente do `§nomes`**: `{ details: [...] }` em vez de `{ withDetails: false }` | O `details` **precisa** ser por rota para o exemplo não mentir — publicar `refreshToken` como campo inválido de `POST /patients` é o edge case 7 acontecendo dentro da própria correção do edge case 7. Com `details` por rota, `withDetails` vira redundante com a ausência dele | Uma opção só: `@ApiValidationErrorResponse()` produz a forma sem `details` (as quatro rotas de `:id`), `@ApiValidationErrorResponse({ details })` produz a forma com. O envelope segue num lugar só, que é o que a decisão 1 protege | `api-validation-error.decorator.ts` | desvio declarado do `§nomes` |

<!-- /§issues -->

---

<!-- §riscos -->

## Riscos e mitigações

| Risco                                                        | Impacto                                                             | Mitigação                                                                                        | Sinal de que aconteceu                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Dado pessoal **real** entrar no seed                         | PII versionada no git, irreversível na prática                      | **Tabela de PII do `§nomes` é a fonte única** — os sete campos de `patients` têm valor fixado antes de codar; revisão de `[Seguranca]` no diff do seed | Qualquer valor de `name`, `phone`, `email`, `birthDate`, `sex`, `heightM` ou `weightKg` que **não** esteja na tabela do `§nomes` |
| Credencial demo em `.env.example` lida como segredo vazado   | Falso positivo em varredura de segredo (F7)                         | Placeholder de ambiente dev-only, e o seed recusa fora de `APP_ENV=dev`. Registrar como **aceito**  | Varredura acusando `prontomed123`                   |
| Exemplo de resposta divergindo do código                     | Documentação que mente — pior que ausente                           | Edge case 7 + revisão rota a rota em `[Produto]` PÓS                                               | Avaliador executa no Swagger e recebe outro payload |
| Seed duplicando dado por rodar 2×                            | Erro no `npm run seed`; avaliador conclui que a agenda está quebrada | Decisão 8 (guarda por existência) + edge case 1, exercitado no passo 10                            | Segunda execução falhando em vez de sair limpa      |
| Gate do `openapi.e2e-spec` nascer verde sem provar nada      | Sensação de cobertura; a próxima rota sem anotação passa            | Ver o gate **reprovando por mutação deliberada** (checklist §higiene) — único jeito de vê-lo vermelho: as anotações preexistem aos passos 3 e 4                           | Gate dado por pronto sem o teste de mutação registrado      |

<!-- /§riscos -->
