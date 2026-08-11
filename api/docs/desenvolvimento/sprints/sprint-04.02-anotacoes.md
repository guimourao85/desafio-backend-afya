# Sprint 04.02 — Anotações e linha do tempo (F5 de PLAN.md §13)

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
> - §riscos — situacional: a sprint toca banco e PII
>
> **Plano canônico:** [PLAN.md §13 — F5](../../PLAN.md) · **Estado:** [PRODUCT.md §roadmap](../../PRODUCT.md)

**Branch:** `main` · **Início:** 2026-08-09 · **Fim:** 2026-08-10 · **Fase:** F5
**Status:** ✅ verde — `lint` + `typecheck` + `build` + 133 unitários + 143 e2e
**Agentes acionados:** `[Database]` `[Seguranca]` `[Dominio]` `[Backend]` `[Produto]` `[QA]`

---

<!-- §objetivo -->

## Objetivo

Depois desta sprint o médico consegue **registrar o que aconteceu no atendimento**
e **reler o histórico de um paciente**. Hoje a agenda sabe *quando* a consulta é e
em que estado ela está, mas não guarda uma linha do que foi observado — a consulta
é um compromisso vazio. A anotação é o que transforma o agendamento em prontuário.

São os **dois últimos requisitos obrigatórios do desafio** (RF-05 e RF-06). Com F5
fechada, os 6 RF obrigatórios e os 5 RNF obrigatórios estão 100% atendidos; o que
sobra no roadmap é desejável ou endurecimento.

**Módulos impactados:** `AppointmentsModule` (agregado ganha entidade interna) ·
`PatientsModule` (consumido, não alterado) · `infrastructure` (tabela nova).

**Risco principal se falhar:** a anotação é texto livre escrito por humano sobre
outro humano. Errar aqui não é um bug de agenda — é PII gravada onde não devia,
ou perdida quando o paciente exerce o direito ao esquecimento. O risco secundário
é performance: a linha do tempo é o primeiro lugar do projeto onde um N+1 é
possível.

**Agentes obrigatórios e por qual gatilho** ([CLAUDE.md §Ativação](../../../../CLAUDE.md)):

| Agente         | Gatilho                                                | Fora do limite? |
| -------------- | ------------------------------------------------------ | --------------- |
| `[Database]`   | tabela nova `consultation_notes` + migration           | sim             |
| `[Seguranca]`  | PII em texto livre + escopo por médico numa tabela sem `doctor_id` | sim  |
| `[Dominio]`    | INV-05 estreia; INV-02 fecha a terceira operação (decisão 14) | não (3 de 3) |
| `[Produto]`    | duas rotas novas, contrato novo                        | não (3 de 3)    |
| `[Backend]`    | fronteira de módulo na timeline                        | não (3 de 3)    |
| `[QA]`         | F5 fecha fase (`PLAN.md §13`)                          | sim             |

**Fora do escopo desta sprint:**

| Fora                                          | Onde vai       |
| --------------------------------------------- | -------------- |
| Editar ou apagar anotação                     | não pedido pelo enunciado; nenhuma fase — corte declarado (decisão 6) |
| `GET /api/appointments/:id/notes`             | cortado em `PLAN.md §3.1` — o detalhe da consulta já devolve as anotações (decisão 1) |
| Seed com as consultas e anotações do wireframe | F6 / sprint 05.01 |
| Teste de duas anotações simultâneas           | fora de escopo — não há unicidade a defender (edge 15) |
| Anonimizar o **conteúdo** da anotação         | **DEBT-01** — e ele **não é trabalho pendente**: o enunciado pede *"mantendo o histórico de consulta"*, então apagar o texto quebraria o requisito. Ver o débito |
| `Idempotency-Key` em requisição HTTP          | **DEBT-05** — o `demo.seed.ts` virou idempotente nesta sprint (issue 9), mas é script de terminal, não rota |
| Recusar anotação em paciente anonimizado | fora — inventaria uma quarta operação em INV-02 que o enunciado não pede (decisão 4 mantida) |
| Enumeração de anonimizados na listagem | **DEBT-15**, aberto e MÉDIO |

<!-- /§objetivo -->

---

<!-- §decisoes -->

## Decisões de execução

> Decisões 1, 2 e 3 **corrigem contradições encontradas no próprio plano** durante
> a leitura de abertura. A decisão 14 **fecha um furo de invariante** descoberto na
> mesma leitura, em código já commitado (issue 3).
>
> **Vaivém registrado (10/08/2026).** A decisão 14 foi cortada e reposta no mesmo
> dia: primeiro o usuário tirou LGPD inteira desta sprint (o furo virou DEBT-14),
> depois reabriu pedindo para validar contra o enunciado. A leitura do PDF é que
> decidiu — ver decisão 20. Fica registrado porque o caminho até a decisão é
> informação: o que salvou não foi opinião de ninguém, foi ir ao requisito.

| #   | Decisão                                             | Escolha                                                                                                       | Rationale                                                                                                                                                                                                                                                                 | Alternativa descartada                                                                                    |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Existe `GET /api/appointments/:id/notes`?           | **Não.** Duas rotas novas, não três                                                                           | `PLAN.md §13 F5` item 4 diz `POST/GET`, mas `§9.1` (linha 602) diz textualmente *"Não há `GET /appointments/:id/notes`"* e `§3.1` lista *"a rota redundante de anotações"* entre os cortes já feitos. Dois documentos contra um: **o §13 está desatualizado e será corrigido** | Criar a rota para "seguir o §13" — seria implementar contra duas decisões declaradas                        |
| 2   | `ListNotesByAppointmentService` nasce?              | **Não.** `GET /api/appointments/:id` passa a carregar `notes` via `relations`                                 | Consequência direta da decisão 1: sem rota, o service não tem chamador. O detalhe da consulta é a leitura que já existe e é onde a anotação naturalmente aparece                                                                                                            | Service sem rota, esperando um consumidor futuro — código morto que o `§3.1` corta                          |
| 3   | Envelope da timeline                                | **`{ data, meta }` paginado**, `?page=&perPage=`, default `perPage=20` — igual a toda listagem da API          | **Revertida na fricção PRÉ** (achado ALTO do `[Produto]`): `review-product.md §verifica` item 2 trata "array cru numa rota e objeto em outra" como ALTO, e o `§9.3` diz *envelope único para toda a API*. O exemplo abreviado do `§9.2` não é autoridade contra a regra — **o §9.2 será corrigido** (item 25) | `{ "data": [...] }` sem `meta`, como eu havia proposto: pouparia uma query de `count` e quebraria o contrato que o avaliador percorre rota a rota |
| 4   | Anotar em consulta de paciente **anonimizado**      | **Permitir — 201.** INV-02 fica como está                                                                     | Escopo que o enunciado não pede, proposto e retirado na abertura (decisão do usuário, 09/08/2026). O `§3.1` é explícito: *"o enunciado pede? Se não pede e não sustenta um item avaliado, fica fora"*. O risco de PII em texto livre já tem endereço — **DEBT-01, ALTO, aberto** —, e não precisa de invariante nova para ser registrado | Recusar com 422, estendendo INV-02 com uma quarta operação bloqueada: amplia uma regra cuja terceira operação nem enforçada estava (decisão 14) |
| 5   | Limite de tamanho de `content`                      | Banco `text`; Zod `.min(1).max(5000)`                                                                        | `text` no banco porque anotação clínica não tem limite natural (`review-database.md §regras`). O `.max()` no Zod é defesa de borda contra payload abusivo, não regra de domínio — por isso vive no schema, não na entity                                                     | Sem `.max()`: aceita um megabyte de texto num POST autenticado                                              |
| 6   | Anotação é imutável                                 | Sem `PATCH` e sem `DELETE` de anotação                                                                        | O enunciado pede *anotar* e *visualizar*. Anotação de prontuário que se reescreve sem trilha é pior que anotação que não se edita                                                                                                                                          | Um `PATCH` "porque CRUD" — superfície nova sem requisito                                                     |
| 7   | `updated_at` na tabela, mesmo com a decisão 6       | **Mantém**, conforme o DDL de `PLAN.md §6.2`                                                                  | Divergir do DDL canônico exige `[Database]`, e o ganho seria uma coluna a menos numa tabela de cinco. O padrão de audit column é o mesmo das outras quatro tabelas                                                                                                          | Cortar a coluna: coerente com a imutabilidade, mas cria exceção de padrão para economizar 8 bytes            |
| 8   | Nome do índice                                      | `idx_consultation_notes_appointment`                                                                          | `review-database.md §regras` manda `idx_<tabela>_<colunas>`. O DDL de `§6.2` escreveu `idx_notes_appointment`, que abrevia a tabela — **a regra vence e o §6.2 será corrigido**                                                                                            | `idx_notes_appointment`: seguiria o DDL e quebraria a regra que o próprio DDL diz seguir                     |
| 9   | `consultation_notes` tem `doctor_id`?               | **Não.** O escopo vem por `appointment_id`                                                                    | A nota só é alcançada pela raiz, e a raiz já filtra `doctorId` em todo método da porta (INV-04). Uma coluna `doctor_id` aqui seria denormalização que pode divergir da raiz — dois lugares dizendo de quem é o dado                                                          | `doctor_id` denormalizado "para filtrar direto": cria a possibilidade de a nota apontar para outro médico    |
| 10  | ~~Persistência do agregado~~ — **SUPERADA pela decisão 18** | ~~`cascade: ['insert']` no `@OneToMany`, um `save(appointment)` no adapter~~ | A premissa era falsa e a fricção PÓS derrubou com o erro do banco na mão: `cascade: ['insert']` governa o que o TypeORM **insere**, e não impede que ele desassocie as filhas que a coleção carregada não lista. O objetivo de ADR-04 (transação do agregado dentro do adapter) continua valendo — muda o mecanismo | — |
| 11  | Ordenação                                           | Timeline: `scheduled_at DESC`. Notas dentro da consulta: `created_at ASC`                                     | Histórico se lê do mais recente; anotações de um mesmo atendimento se leem na ordem em que foram escritas                                                                                                                                                                  | Ambos `DESC`: leitura da conversa clínica de trás para frente                                                |
| 12  | Timeline inclui consultas canceladas?               | **Sim**, com o `status` no payload                                                                            | O wireframe mostra a coluna de status; e RF-08/INV-03 sustentam que o histórico é registro contábil — esconder cancelada é reescrever histórico                                                                                                                            | Filtrar canceladas: payload mais limpo, história incompleta                                                  |
| 13  | Onde mora o controller da timeline                  | `controllers/domain/appointments/get-patient-timeline.controller.ts`, com `@Controller('patients')`           | O dado é do agregado `Appointment`; a URL é do paciente porque é assim que o cliente pensa. O arquivo segue o agregado, a rota segue o cliente                                                                                                                             | Pôr em `controllers/domain/patients/`: o controller de pacientes injetando service de agenda inverte a fronteira |
| 15  | **Reagendar consulta de paciente anonimizado** (cortada e **reposta** em 10/08/2026 — ver decisão 20) | **Recusar — 422.** `UpdateAppointmentService` consulta `FindPatientSummaryService` antes de checar o horário | INV-02 já mandava bloquear reagendamento desde F3, e o service nunca verificou (issue 3). Não é escopo novo: é uma lei do sistema, escrita em `PRODUCT.md §invariantes`, que o código não cumpria. Mesmo padrão do `ScheduleAppointmentService`, ~10 linhas, no módulo que esta sprint já abre. A checagem vem **antes** do conflito de slot: 409 num paciente anonimizado mandaria o cliente procurar outro horário para um pedido que nenhum horário resolve | Reduzir INV-02 ao que o código faz e mandar o reagendamento para o ledger: deixaria uma invariante falsa no documento que existe para ser verdade. Foi o caminho tomado por algumas horas, e desfeito |
| 15  | `ON DELETE` da FK `appointment_id` | **`NO ACTION`** (o padrão), declarado de propósito | Apagar uma consulta que tem anotação **deve** falhar. `CASCADE` daria a um `DELETE` físico o poder de sumir com registro clínico; e `DELETE` de consulta nem existe na API — cancelar é `status = CANCELLED`. O `NO ACTION` é a rede que protege de um script manual | `CASCADE`: conveniente e destrutivo. `SET NULL`: cria nota órfã, que a decisão 9 existe para impedir |
| 16  | `content` não vazio também no banco | **`ck_consultation_notes_content_not_empty`** — `length(btrim(content)) > 0` | Achado MÉDIO do `[Database]` na fricção PRÉ. O `.min(1)` do Zod cobre a borda HTTP, mas o seed e a migration escrevem por baixo dela. O projeto já tem o precedente: `ck_patients_birth_date` guarda no banco o que o Zod também guarda | Só a validação Zod: uma anotação vazia entra por qualquer caminho que não seja o controller |
| 17  | Nome e assinatura do método que grava as notas (lacuna do §escopo item 6, fechada na implementação) | **`appendNotes(appointment: Appointment)`** — **sem `doctorId`** | O `save` existente é um `UPDATE` de duas colunas e nunca gravaria a nota. Sobre o `doctorId` ausente: ele existe nos outros métodos porque lá o argumento é um `id` cru, que qualquer string satisfaz. Aqui o argumento **é a raiz já escopada** — só obtida por `findByIdForDoctor`, `findByIdWithNotes` ou `create` —, então o escopo viaja no objeto, e um parâmetro repetindo `appointment.doctorId` seria proteção decorativa | `save(appointment, doctorId)` reaproveitado: teria de virar `repository.save()`, e aí o `UPDATE` cirúrgico do reagendamento passaria a reescrever a raiz inteira |
| 18  | **Como a anotação chega ao banco** (achado da fricção PÓS, ver issue 6) | **`appendNotes` grava só as notas sem `id`**, numa transação no adapter. `cascade` **removido** do `@OneToMany` | Ao persistir uma raiz cuja coleção `@OneToMany` está carregada, o TypeORM trata a lista como o **estado completo** e desassocia (`SET NULL`) o que não estiver nela. Com a raiz lida sem `relations` — que é o caso de quem só quer anotar —, isso apaga o vínculo das notas já gravadas. Verificado: `null value in column "appointment_id" violates not-null constraint`. Gravar só o que não tem identidade é **seguro por construção**, e não depende de o chamador ter carregado a coleção inteira | `findByIdWithNotes` também no `AddConsultationNoteService`, mantendo o `cascade`: funciona, mas puxa o prontuário inteiro para inserir uma linha e deixa a armadilha armada para o próximo chamador que não souber |
| 19  | Uma leitura da raiz ou duas? (achado da fricção PÓS, ver issue 5) | **Duas**: `findByIdForDoctor` (raiz nua) e `findByIdWithNotes` (com as anotações) | Pôr `relations` dentro de `findByIdForDoctor` contaminava os quatro consumidores: `PATCH /appointments/:id` passou a publicar `notes` — mudança de contrato que ninguém pediu — e reagendar/cancelar puxavam o prontuário para reescrever uma coluna. Método separado deixa o custo do `JOIN` visível no nome, e quem chama declara o que precisa | Um parâmetro booleano `withNotes`: esconde o custo atrás de um argumento e produz duas queries muito diferentes sob o mesmo nome |
| 20  | **Quanto de LGPD entra nesta sprint** (a pergunta que gerou o vaivém do dia) | **Só a decisão 14.** Medido contra o enunciado, não contra opinião | O PDF menciona LGPD em **uma linha**, e em *requisitos desejáveis*: *"quero poder excluir os dados pessoais do paciente (…) mas mantendo o histórico de consulta por questões de contabilidade"*. Isso decide as três peças de uma vez: **(a)** excluir dados pessoais já existe desde F3; **(b)** INV-02 no reagendamento é regra **nossa**, já escrita e enforçada em 2 de 3 operações — 10 linhas para o documento parar de mentir, e nada no enunciado a contradiz; **(c)** apagar o `content` das anotações (DEBT-01) faria o **oposto** do que a frase pede, então não é dívida a pagar, é caminho a não seguir; **(d)** recusar anotação em paciente anonimizado não está em lugar nenhum do enunciado — inventaria uma quarta operação em INV-02 | Tratar "LGPD" como um bloco único, para implementar inteiro ou adiar inteiro. As quatro peças têm custos e vereditos diferentes, e agrupá-las escondia isso — foi o que produziu o corte da manhã e a reposição da tarde |

> A decisão 14 acrescenta **uma linha** a `PRODUCT.md §regras` (a mensagem do 422 no
> reagendamento) — INV-02 **não muda**, porque ela já dizia isso; o que muda é o
> código passar a cumpri-la. Decisões 1, 2, 3 e 8 corrigem `PLAN.md` §13, §6.2 e
> §9.2. Nenhuma vira ADR: são correção de drift e de enforcement ausente, não
> decisão arquitetural nova.

<!-- /§decisoes -->

---

<!-- §nomes -->

## Nomes fixados

| Tipo       | Nome                                       | Onde                                       | Descrição                                        |
| ---------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------------ |
| Tabela     | `consultation_notes`                       | migration                                  | observação do atendimento                        |
| Coluna     | `appointment_id`                           | `consultation_notes`                       | FK para a raiz do agregado                       |
| Coluna     | `content`                                  | `consultation_notes`                       | `text NOT NULL` — o que o médico escreveu        |
| Coluna     | `created_at` / `updated_at`                | `consultation_notes`                       | audit, `timestamptz` (decisão 7)                 |
| Constraint | `pk_consultation_notes`                    | `consultation_notes`                       | PK uuid                                          |
| Constraint | `fk_consultation_notes_appointments`       | `consultation_notes`                       | `appointment_id → appointments(id)`, `ON DELETE NO ACTION` (decisão 15) |
| Constraint | `ck_consultation_notes_content_not_empty`  | `consultation_notes`                       | `length(btrim(content)) > 0` (decisão 16)        |
| Índice     | `idx_consultation_notes_appointment`       | `consultation_notes`                       | `(appointment_id, created_at)` — performance (decisão 8) |
| Entity     | `ConsultationNote`                         | `model-entities/consultation-note.entity.ts` | entidade interna do agregado                   |
| Service    | `AddConsultationNoteService`               | `services/appointments/`                   | RF-05                                            |
| Service    | `GetPatientTimelineService`                | `services/appointments/`                   | RF-06                                            |
| Rota       | `POST /api/appointments/:id/notes`         | controller                                 | RF-05 → 201                                      |
| Rota       | `GET /api/patients/:id/appointments`       | controller                                 | RF-06 → 200                                      |
| Presenter  | `ConsultationNotePresenter`                | `presentation/presenters/`                 | serializa a nota                                 |
| Presenter  | `PatientTimelinePresenter`                 | `presentation/presenters/`                 | consulta + suas notas                            |
| Migration  | `<timestamp>-consultation-notes.ts`        | `migrations/`                              | `npm run migration:generate --name=consultation-notes` |
| Método     | `listByPatientWithNotes`                   | `appointment.repository.ts` (porta)        | linha do tempo paginada, `doctorId` obrigatório  |
| Método     | `findByIdWithNotes`                        | `appointment.repository.ts` (porta)        | detalhe da consulta, único `JOIN` de leitura única (decisão 19) |
| Método     | `appendNotes`                              | `appointment.repository.ts` (porta)        | grava só as notas sem `id` (decisões 17 e 18)    |
| Constante  | `CANNOT_ANNOTATE_CANCELLED_MESSAGE`        | `appointment.entity.ts`                    | "Consulta cancelada não aceita anotações." (INV-05) |

**Sem env novo. Sem `DomainError.code` novo** — a recusa de INV-05 usa
`BUSINESS_RULE_VIOLATION` (422), já no catálogo do `§9.4`. A constante segue o padrão
dos três textos de recusa de estado que já vivem na entity: texto copiado de
`PRODUCT.md §regras`, nunca inventado no service.

<!-- /§nomes -->

---

<!-- §escopo -->

## Escopo — plano ordenado

| #   | Ação   | Arquivo                                                                        | Tipo  | Depende de |
| --- | ------ | ------------------------------------------------------------------------------ | ----- | ---------- |
| 1   | Criar  | `src/domains/domain/model-entities/consultation-note.entity.ts` — `primaryKeyConstraintName`, `foreignKeyConstraintName`, `@Index` e `@Check` **nomeados na entity** (ADR-03) | NOVO | — |
| 2   | Editar | `src/domains/domain/model-entities/index.ts` (export) + lista de entities do datasource | ALTER | 1  |
| 3   | Editar | `src/domains/domain/model-entities/appointment.entity.ts` — `@OneToMany notes` + `addNote()` | ALTER | 1 |
| 4   | Gerar  | `src/infrastructure/databases/typeorm/postgres/migrations/<ts>-consultation-notes.ts` | NOVO | 2, 3 |
| 5   | Editar | `src/domains/domain/repositories/appointment.repository.ts` — `listByPatientWithNotes(filters: PatientTimelineFilters): Promise<AppointmentPage>`, com **`doctorId` obrigatório** no filtro (INV-04) | ALTER | 3 |
| 6   | Editar | `src/infrastructure/.../repositories/typeorm-appointment.repository.ts` — `relations` em `findByIdForDoctor`, novo método, cascade | ALTER | 5 |
| 7   | Criar  | `src/domains/domain/services/appointments/add-consultation-note.service.ts`    | NOVO  | 3, 6       |
| 8   | Criar  | `src/domains/domain/services/appointments/get-patient-timeline.service.ts`     | NOVO  | 6          |
| 9   | Editar | `src/domains/domain/services/appointments/appointments.provider.ts`            | ALTER | 7, 8       |
| 10  | Editar | `src/domains/domain/services/appointments/appointments.module.ts` (exports)    | ALTER | 9          |
| 11  | Criar  | `src/presentation/presenters/consultation-note.presenter.ts`                   | NOVO  | 1          |
| 12  | Criar  | `src/presentation/presenters/patient-timeline.presenter.ts`                    | NOVO  | 11         |
| 13  | Editar | `src/presentation/presenters/appointment.presenter.ts` — inclui `notes` quando carregadas | ALTER | 11 |
| 14  | Editar | `src/gateways/http/schemas/domain/appointment.schema.ts` — `addConsultationNoteSchema` | ALTER | —   |
| 15  | Criar  | `add-consultation-note.controller.ts` — `@ApiTags('Agendamentos')`, `@ApiOperation`, `@ApiResponse` **com exemplo de 201, 404 e 422** | NOVO | 7, 11, 14 |
| 16  | Criar  | `get-patient-timeline.controller.ts` — `@ApiTags('Pacientes')`, `@ApiOperation`, `@ApiResponse` **com exemplo de 200 e 404** | NOVO | 8, 12 |
| 17  | Editar | `src/gateways/http/http.module.ts` — registra os dois controllers              | ALTER | 15, 16     |
| 18  | Editar | `test/**` helper de truncate — incluir `consultation_notes` **antes** de `appointments` (FK) | ALTER | 4 |
| 19  | Criar  | specs unitários: `add-consultation-note`, `get-patient-timeline`, `addNote()` na entity | NOVO | 7, 8 |
| 20  | Editar | `test/integration/` — e2e das duas rotas + INV-03 (anonimizar preserva notas)  | ALTER | 15, 16     |
| 21  | Editar | `update-appointment.service.ts` — INV-02 no reagendamento (decisão 14)         | ALTER | —          |
| 22  | Editar | spec de `update-appointment` + e2e de `appointments` — as 3 operações de INV-02 e o que continua permitido | ALTER | 21 |
| 23  | Editar | `api/docs/PLAN.md` §13 F5 e §6.2 — decisões 1, 2, 8, 16                        | ALTER | —          |
| 24  | Editar | `api/docs/PRODUCT.md` §regras — linha do 422 no reagendamento (decisão 14)     | ALTER | 21         |
| 25  | Editar | `api/docs/PLAN.md` §9.2 — payload da timeline com `meta` (decisão 3)           | ALTER | —          |
| 26  | Editar | `api/docs/DEBITOS-TECNICOS.md` — **DEBT-14** para §resolvidos; DEBT-01 amarrado ao enunciado; contagens | ALTER | 21 |
| 27  | Editar | `update-appointment.controller.ts` — Swagger com os **dois** exemplos de 422   | ALTER | 21         |

### Migrations

| Arquivo                             | Escopo                                                       | Gerada por                                            | Revisado                |
| ----------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- | ----------------------- |
| `<timestamp>-consultation-notes.ts` | cria `consultation_notes` com PK, FK, índice e audit columns | `npm run migration:generate --name=consultation-notes` | ⬜ SQL lido linha a linha |

**Conferir no SQL gerado:** nomes `pk_` / `fk_` / `idx_` / `ck_` exatamente como em
§nomes · `content text NOT NULL` (não `varchar`) · `created_at`/`updated_at`
`timestamptz` · FK **sem `ON DELETE CASCADE`** (decisão 15) · `CHECK` de conteúdo
não vazio presente (decisão 16) · `down()` derrubando check, índice e tabela ·
nenhuma coluna `doctor_id` (decisão 9).

> ⚠️ **Armadilha conhecida (sprint 04.01, §issues):** path alias `@/` quebra o
> carregamento de entities no CLI do TypeORM. Import relativo na entity nova.

<!-- /§escopo -->

---

<!-- §edge-cases -->

## Edge cases

| #   | Caso                                                          | Comportamento esperado                                            | Coberto por                        |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| 1   | Anotar em consulta `CANCELLED`                                | 422 `BUSINESS_RULE_VIOLATION` — "Consulta cancelada não aceita anotações." (INV-05) | guarda em `addNote()` + spec |
| 2   | Anotar em consulta `COMPLETED`                                | **201 — permitido.** Anota-se depois de atender; `isActive()` só barra `CANCELLED` | spec unitário da entity      |
| 3   | Anotar em consulta de **outro médico**                        | 404 `RESOURCE_NOT_FOUND` (INV-04, nunca 403)                      | `findByIdForDoctor` + e2e          |
| 4   | Anotar em consulta inexistente                                | 404 — indistinguível do caso 3, de propósito                      | e2e                                |
| 5   | Anotar em consulta de paciente **anonimizado**                | **201 — permitido** (decisão 4). O risco de PII é DEBT-01, aberto | e2e que documenta o comportamento  |
| 5b  | **Reagendar** consulta de paciente anonimizado                | 422 — "Paciente anonimizado (LGPD) não pode ter consultas reagendadas." (INV-02, decisão 14) | `update-appointment` spec + e2e |
| 5c  | **Concluir ou cancelar** consulta de paciente anonimizado     | **200 / 204 — permitido.** Registrar o que já aconteceu é preservar o histórico, que é o que o enunciado manda | spec + e2e |
| 6   | `content` vazio ou só espaços                                 | 400 `VALIDATION_ERROR` — `.min(1)` após `trim`                    | schema Zod + e2e                   |
| 7   | `content` acima de 5000 caracteres                            | 400 `VALIDATION_ERROR` (decisão 5)                                | schema Zod                         |
| 8   | Campo desconhecido no corpo                                   | 400 — `.strict()`                                                 | schema Zod                         |
| 9   | Timeline de paciente de outro médico                          | 404 (INV-04), antes de qualquer leitura de agenda                 | `FindPatientSummaryService` + e2e  |
| 10  | Timeline de paciente **anonimizado**                          | **200 com os dados** — INV-03 exige que o histórico sobreviva     | e2e que conta registros            |
| 11  | Timeline de paciente sem nenhuma consulta                     | 200 com `{ "data": [], "meta": { …, "total": 0 } }` — não é 404    | e2e                                |
| 11b | Timeline com `?page=2` além do fim                            | 200 com `data` vazio e `meta` coerente — não é 404                | e2e                                |
| 12  | Consulta sem anotações dentro da timeline                     | `"notes": []`, nunca `null` nem campo ausente                     | presenter + e2e                    |
| 13  | Anonimizar paciente que tem anotações                         | anotações **preservadas**, contagem idêntica antes e depois (INV-03) | e2e que conta antes e depois    |
| 14  | Timeline de paciente com N consultas e M anotações            | **uma** query com `relations`, nunca 1+N                          | spec com contador de query / revisão do adapter |
| 15  | Concorrência: duas anotações simultâneas na mesma consulta    | ambas gravam — não há unicidade a defender aqui                   | fora desta sprint                  |
| 16  | Cancelar consulta que já tem anotações                        | cancela; anotações permanecem legíveis pelo detalhe               | e2e                                |

<!-- /§edge-cases -->

---

<!-- §checklist -->

## Checklist anti-erro (pré-fechamento)

**Verde**

- [x] `npm run lint && npm run typecheck && npm run build && npm test` — todos verdes
- [x] `npm run test:e2e` verde
- [x] "Pronto quando" de `PLAN.md §13 F5` satisfeito à mão: a timeline devolve as consultas do paciente com suas anotações **em uma chamada**
- [x] Teste empírico por rota (curl ao vivo) nas duas rotas novas

**Arquitetura**

- [x] Regra de fronteira do ESLint intacta e provada
- [x] Service: um `execute`, sem `Request`/`Response`, sem ORM, sem `throw` para erro esperado
- [x] Erro esperado é `Either<L,R>`; `DomainError` com `code` estável
- [x] Provider entrega o adapter da porta, nunca `Repository<T>` cru
- [x] `AppointmentsModule` usa `FindPatientSummaryService`, **nunca** `PATIENTS_REPOSITORY`
- [x] **Não existe** `ConsultationNoteRepository` — um repositório por raiz, quatro no total
- [x] `new ConsultationNote(...)` aparece **só** dentro de `Appointment.addNote()` — nenhum service ou controller instancia a entidade interna direto (`[Dominio]` PRÉ, BAIXO)
- [x] Transação do agregado vive no adapter, não no service

**Banco**

- [x] Migration gerada, SQL revisado linha a linha, forward-only
- [x] Constraints nomeadas na entity; nomes conforme §nomes
- [x] `down()` real, desfazendo exatamente o que `up()` fez
- [x] `consultation_notes` **sem** `doctor_id` (decisão 9)

**Segurança**

- [x] Toda leitura e escrita escopada por `doctorId` via `@CurrentDoctor()`
- [x] A nota é inalcançável a não ser pela raiz escopada
- [x] `content` não aparece em log
- [x] DEBT-01 continua declarado e não foi silenciosamente "resolvido"

**Contrato**

- [x] Zod `.strict()` na borda; Swagger sai do Zod
- [x] Status conforme `§9.1`: 201 no POST, 200 no GET
- [x] Mensagens em PT-BR
- [x] `/api/docs` executa as duas rotas com o botão Authorize

**Higiene**

- [x] Nenhum `console.log`, `TODO` ou arquivo morto
- [x] Testes determinísticos; caminho feliz + erro + edge case
- [x] Scores ≥ 9/10 na fricção PÓS; zero CRÍTICO e zero ALTO em aberto
- [x] Edge case 14 (N+1): provado **empiricamente** — 2 queries constantes para 3 consultas, log do Postgres — mas **sem teste automatizado**; ressalva registrada no score do `[QA]`
- [x] **INV-02 enforçada nas três operações que ela lista**: editar ✅ (F3), agendar ✅ (F4), reagendar ✅ (decisão 14) — com teste unitário e e2e em cada uma, e as três verificadas ao vivo
- [x] O que INV-02 **não** bloqueia continua funcionando: concluir, cancelar e anotar em paciente anonimizado — porque o enunciado manda manter o histórico de consulta
- [x] **DEBT-14 movido para §resolvidos** com "Resolvido em" e "Como"; DEBT-01 amarrado ao enunciado (fechá-lo do jeito óbvio quebraria o requisito); contagens do §visao-geral refeitas
- [x] `PRODUCT.md §roadmap` → 04.02 ✅ · §regras com a linha do 422 no reagendamento · `PLAN.md` §13 F5, §6.2 e §9.2 corrigidos

<!-- /§checklist -->

---

<!-- §scores -->

## Scores de fricção

| Agente        | Fase | Score    | Severidade máxima | Observação |
| ------------- | ---- | -------- | ----------------- | ---------- |
| `[Database]`  | PRÉ  | **9/10** | MÉDIO (2), resolvidos no doc | `ON DELETE` da FK não estava declarado → decisão 15. `content` sem guarda no banco, tendo o projeto o precedente `ck_patients_birth_date` → decisão 16. BAIXO aceito: INV-05 sob corrida (cancelar e anotar ao mesmo tempo) não é enforçável sem trigger — desproporcional para POC, e o dano é uma nota em consulta cancelada, não agenda corrompida |
| `[Seguranca]` | PRÉ  | **9/10** | **ALTO (1), resolvido no doc** | `listByPatientWithNotes` estava no §escopo sem assinatura, e `consultation_notes` não tem `doctor_id` (decisão 9) — a nota só é escopada se a query da **raiz** filtrar `doctorId`. Item 5 agora fixa o filtro obrigatório. MÉDIO com ressalva registrada: a decisão 4 (permitir anotação em paciente anonimizado) é escolha do usuário com preço declarado; DEBT-01 segue o endereço do risco |
| `[Dominio]`   | PRÉ  | **9/10** | BAIXO (1), resolvido no doc | Construtor de `ConsultationNote` é público e aceitaria estado inválido se chamado de fora da raiz; virou item de checklist. As 7 invariantes percorridas: INV-02 ganha enforcement (decisão 14), INV-05 estreia, INV-03 tem teste que conta registros, nenhuma das outras é tocada |
| `[Produto]`   | PRÉ  | **9/10** | **ALTO (1), resolvido no doc** | Decisão 3 quebrava o envelope único de listagem (`§9.3` + `review-product.md §verifica` item 2) — **revertida**, timeline passa a ser `{data, meta}`. MÉDIO: itens 15-16 do §escopo não declaravam as anotações Swagger; agora exigem `@ApiResponse` com exemplo dos erros |
| `[Produto]`   | PÓS  | **9/10** | MÉDIO (1), corrigido | O `examples` do 422 do `PATCH` estava aninhado sob `schema` e não renderizava no Swagger UI (issue 7) — falha silenciosa numa ferramenta que **é** o meio de avaliação. Corrigido e conferido no `/api/docs-json`. O resto fecha: envelope `{data, meta}` igual ao das outras listagens, 201/200 conforme `§9.1`, mensagens em PT-BR copiadas de `PRODUCT.md §regras` e nunca inventadas no service, e as duas rotas novas executáveis pelo botão Authorize |
| `[Backend]`   | PÓS  | **9/10** | **ALTO (1) e MÉDIO (1), ambos corrigidos** | ALTO: `cascade: ['insert']` não impede a desassociação das filhas que a coleção carregada não lista — o desenho da decisão 10 funcionava por acidente (issue 6 → decisão 18). MÉDIO: `relations` dentro de `findByIdForDoctor` contaminava os quatro consumidores e mudou o contrato do `PATCH` (issue 5 → decisão 19). Camadas limpas: nenhum import de ORM em `services/**`, provider entrega o adapter, `AppointmentsModule` usa `FindPatientSummaryService` e nunca `PATIENTS_REPOSITORY`, transação só no adapter. Nota do −1: os dois achados eram meus e nenhum apareceria sem a fricção PÓS |
| `[QA]`        | PÓS  | **9/10** | MÉDIO (1), aceito com ressalva | **133 unitários (21 suítes) + 139 e2e (9 suítes) verdes no fechamento da sprint 04** — o score havia sido anotado a 130+136, antes dos últimos testes de INV-02 entrarem; reconferido na fricção final de 10/08/2026. Número **congelado nesta data**: o que a sprint 05.01 acrescentar conta para ela, não para cá. INV-03, INV-04 e INV-05 com teste nomeado; caminho de erro tão coberto quanto o feliz; nenhum `sleep`, nenhuma data "de hoje", duplo determinístico por contador. **Ressalva:** o edge case 14 (N+1) foi provado **empiricamente** — log do Postgres mostrando 2 queries constantes para 3 consultas —, mas nenhum teste automatizado o trava. Trocar `leftJoinAndSelect` por lazy loading não reprovaria a suíte. O §escopo item 19 admitia "spec com contador de query **ou** revisão do adapter"; ficou a revisão |
| `[Database]`  | PÓS  | **10/10** | nenhum | Migration gerada, revisada linha a linha e aplicada nos dois bancos. A armadilha do §16.4 apareceu pela terceira vez — **quatro** `DROP CONSTRAINT` de FKs alheias no `up()` — e foi removida. Schema conferido contra §nomes no banco real: `pk_`/`fk_`/`idx_`/`ck_` exatos, `content text`, dois `timestamptz`, sem `doctor_id`, FK sem `CASCADE`. `down()` exercitado de verdade (revert → 4 FKs → re-run → 5 FKs). As duas garantias de banco viraram teste: o `CHECK` recusa nota vazia por SQL direto, e a FK recusa apagar consulta com anotação |
| `[Seguranca]` | PÓS  | **10/10** | nenhum | INV-04 provado ao vivo com dois médicos e nas duas rotas novas: consulta alheia e paciente alheio respondem 404 idêntico ao inexistente, e nenhuma linha foi escrita pelo invasor. A nota não tem `doctor_id` próprio e é inalcançável fora da raiz escopada. `content` não aparece em log nenhum. **INV-02 fechada nas três operações** e verificada ao vivo. DEBT-01 segue aberto, agora com a razão certa registrada: fechá-lo do jeito óbvio quebraria o requisito de manter o histórico |

**Conflitos entre agentes e como foram resolvidos:**

Um, e não foi entre agentes — foi entre uma decisão minha e uma regra do projeto.
A decisão 3 (timeline sem `meta`) tinha apoio no exemplo de `PLAN.md §9.2` e
colidia com `§9.3` e com o cheque ALTO do `[Produto]`. **Regra vence exemplo:** o
`§9.2` está abreviado e foi corrigido (item 25). Sem conflito de hierarquia.

**O que a fricção PÓS pegou e a PRÉ não tinha como pegar:** os dois achados
(decisões 18 e 19) são sobre **comportamento do TypeORM**, não sobre desenho no
papel. A PRÉ leu um plano que dizia "`cascade: ['insert']`, um `save` no adapter" e
não tinha por que duvidar — a frase é idiomática e está em qualquer tutorial. Só o
código rodando contra o Postgres mostrou que ela era falsa. É o argumento a favor da
fricção PÓS existir mesmo quando a PRÉ fecha 9/10 em todos os agentes.

<!-- /§scores -->

---

<!-- §issues -->

## Issues encontrados durante a implementação

| #   | Descoberta                                                                                          | Causa raiz                                                                                  | Solução             | Arquivos            | Virou   |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------- | ------------------- | ------- |
| 1   | `PLAN.md §13 F5` manda criar `GET /appointments/:id/notes`, que `§9.1` e `§3.1` declaram cortada     | O corte foi decidido no `§9.1` e registrado no `§3.1`; o `§13` não foi atualizado junto      | Decisões 1 e 2; item 21 do §escopo | `PLAN.md` | correção de drift |
| 2   | DDL de `§6.2` nomeia o índice `idx_notes_appointment`, fora da regra `idx_<tabela>_<colunas>`        | DDL escrito antes de `review-database.md §regras` virar fonte única                          | Decisão 8; item 23  | `PLAN.md`           | correção de drift |
| 3   | **INV-02 manda bloquear reagendamento de paciente anonimizado; `UpdateAppointmentService` nunca verificou** — ALTO | O service foi escrito olhando os guardas de estado da entity (terminal/não-terminal) e o conflito de slot; o estado do **paciente** não entrou no roteiro. A fricção PÓS da 04.01 não pegou | Decisão 14; itens 21, 22, 24, 27. Virou **DEBT-14 por algumas horas** e voltou — ver decisão 20 | `update-appointment.service.ts` + controller + specs + e2e + `PRODUCT.md §regras` | correção de enforcement |
| 4   | O item 6 do §escopo pedia "novo método, cascade" no adapter sem nomear o método, e §nomes não o listava | Escrever o §escopo a partir do que muda (o arquivo) em vez do que nasce (a assinatura) — a fricção PRÉ passou porque nenhum agente cobra nome de método de porta | Decisão 17: `appendNotes(appointment)`, sem `doctorId`, com o porquê registrado | `appointment.repository.ts` + adapter | decisão de implementação |
| 5   | **`relations` dentro de `findByIdForDoctor` vazou para os quatro consumidores** — `PATCH /appointments/:id` passou a publicar `notes`, e reagendar/cancelar puxavam o prontuário para reescrever uma coluna — MÉDIO | Otimizei para o consumidor que eu tinha na cabeça (o detalhe da consulta) e não olhei quem mais chamava o método. Nenhum teste travava a forma da resposta do `PATCH`, então a mudança de contrato passou silenciosa | Decisão 19: duas leituras (`findByIdForDoctor` nua, `findByIdWithNotes` com join). Teste e2e parametrizado travando as três rotas que **não** publicam `notes` | porta, adapter, `get-appointment.service.ts`, e2e | corrigido na sprint |
| 6   | **`cascade: ['insert']` não protege o que a coleção carregada não lista** — salvar a raiz com notas parciais desassocia as gravadas (`appointment_id` nulo) — **ALTO** | Premissa minha sobre o TypeORM, escrita como se fosse garantia em três comentários de código. Passou despercebida enquanto todo chamador lia a raiz com `relations` — o desenho funcionava por acidente, e a decisão 19 tirou o acidente | Decisão 18: `appendNotes` grava só as notas sem `id`, transação no adapter, `cascade` removido. Teste e2e com 3 anotações sequenciais + contagem no banco | entity, porta, adapter, duplo, e2e | corrigido na sprint |
| 7   | **`examples` do Swagger aninhado dentro de `schema` não renderiza no Swagger UI** — MÉDIO | No OpenAPI 3 o `examples` é irmão do `schema` dentro do media type, não filho. Aninhado errado, o `/api/docs-json` continua saindo válido e a rota simplesmente não mostra exemplo — falha silenciosa, e o Swagger é a ferramenta de avaliação (`PLAN.md §14.3`) | Trocado `schema:` por `content: { 'application/json': { examples } }`; conferido no `/api/docs-json` | `update-appointment.controller.ts` | corrigido na sprint |
| 8   | **O anonimizado continua enumerável na listagem, e `?search=anonimizado` virou filtro acidental para ele** — com `sex`, `heightM`, `weightKg` e as datas das consultas na mão, o médico reidentifica de memória — MÉDIO | A anonimização foi desenhada olhando a linha (quais colunas apagar) e não o conjunto (o que sobra quando N linhas idênticas ficam lado a lado). O rótulo `"Paciente anonimizado"` foi escolhido para manter a linha legível — e legibilidade num `ILIKE` é filtro | Decisão do usuário em 10/08/2026: fica como está, porque a listagem é a prova visual do RF-08 para o Avaliador → **DEBT-15**, MÉDIO, aberto | nenhum arquivo de código; `DEBITOS-TECNICOS.md` | débito declarado |

| 9   | **`npm run seed` saía com código 1 na segunda execução** (`uk_doctors_email`) — MÉDIO | O script foi escrito não-idempotente **de propósito**, sob a decisão de 07/08/2026 de não tratar idempotência fora da sprint dedicada. A decisão tratava "requisição HTTP" e "script de terminal" como um assunto só — e eles têm custos muito diferentes | Decisão do usuário em 10/08/2026 revogando a regra **só para scripts**: o seed passou a reconfirmar a credencial do `.env` em vez de falhar. `Idempotency-Key` (DEBT-05) segue aberto | `demo.seed.ts` + `test/integration/seed.e2e-spec.ts` (novo, 4 casos) + README passo 7 | corrigido na sprint |

**Achados da fricção final da sprint 04** (10/08/2026) — todos de **documentação**;
nenhuma pendência de código restou em F4 ou F5. Vêm depois do fechamento porque a
fricção PÓS desta sprint olhou o que a sprint **mudou**, e estes são pontos que a
sprint **não tocou** e que envelheceram por causa dela.

| #   | Descoberta                                                                                          | Causa raiz                                                                                  | Solução             | Arquivos            | Virou   |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------- | ------------------- | ------- |
| 10  | **`PLAN.md §13 F5` item 3 ainda ensinava a armadilha que a decisão 18 derrubou** — dizia "persistência do agregado inteiro (raiz + anotações) em uma transação", que é exatamente o desenho com `cascade` cujo achado ALTO custou a issue 6 | A issue 6 corrigiu o **código** e registrou o porquê aqui; ninguém voltou ao §13, que descreve o **mecanismo**. Um plano que sobrevive ao próprio achado reensina o erro para quem ler F5 do zero | Item 3 reescrito com `appendNotes` e o porquê; item 5 também, que dizia `relations` onde o adapter usa `leftJoinAndSelect` | `PLAN.md §13 F5`, itens 3 e 5 | correção de drift |
| 11  | **`§9.1` desatualizado em duas rotas**: a linha do tempo sem `?page=&perPage=` e sem `400`, e `DELETE /appointments/:id` sem o `422` de cancelar concluída | A decisão 3 (envelope paginado) corrigiu o exemplo do `§9.2` e não a tabela do `§9.1`; o 422 do cancelamento nasceu em F4 e a tabela nunca foi reconfrontada. **Nenhum agente cobra a tabela** — `review-product.md` cobra o Swagger da rota nova, não o contrato que ela deveria refletir | Duas linhas corrigidas + `§9.4` passa a nomear a máquina de estados como origem de 422 | `PLAN.md §9.1` (2 linhas) + `§9.4` | correção de drift |
| 12  | **A matriz `§12.4` pedia INV-02 em duas operações; o código enforça três** desde a issue 3 desta sprint | Mesma causa da issue 9: a correção parou no código e no `PRODUCT.md §regras`. Matriz que pede menos do que o código faz deixa de ser gate — e é ela que o `[QA]` usa | Linha corrigida | `PLAN.md §12.4` | correção de drift |
| 13  | **RF-06 não tinha nenhuma linha obrigatória na `§12.4`**, embora `§13 F5` item 6 peça "timeline ordenada" e o e2e cubra com 7 casos | A matriz foi escrita em F0, quando RF-06 ainda era uma linha de escopo. Nenhuma fase tem o gate "acrescente seus casos obrigatórios à `§12.4`" | Duas linhas novas (ordenação e paginação por consulta) | `PLAN.md` | correção de drift |
| 14  | **`§issues` desta sprint tinha dois itens `7` e os itens 6 e 7 fora de ordem**; o `§scores` do `[QA]` registrava 130+136 testes contra 133+139 reais | Tabela preenchida ao longo da sprint, por acréscimo, sem releitura do conjunto no fechamento | Renumerado (1–8, referências cruzadas do `§scores` preservadas) e contagem reconferida | este doc | correção de doc |
| 15  | **OpenAPI não documenta `401` em 12 das 17 operações**, embora `§9.1` o declare e o runtime o devolva | A **mesma** causa do 400 não documentado: `review-product.md` enumerava os erros "interessantes" e lista fechada vira teto. O contrato foi corrigido; o inventário do dano só cobriu o 400 | **Não é pendência da sprint 04** — Swagger é F6. Entrou no escopo da [sprint-05.01](sprint-05.01-swagger-e-seed.md) (decisões 1 a 3, passo 4) | `sprint-05.01` | escopo da 05.01 |

> Preencher **ao longo** da sprint, não no fim.

<!-- /§issues -->

---

<!-- §riscos -->

### Riscos e mitigações

| Risco                                                                 | Impacto                                                              | Mitigação                                                                                 | Sinal de que aconteceu                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| N+1 na timeline                                                       | uma query por consulta; degrada com histórico longo                  | `relations` em uma leitura só; edge case 14 é gate de fechamento                          | log do TypeORM com N `SELECT` em `consultation_notes`      |
| PII em texto livre sobrevivendo à anonimização                        | o `content` pode conter o nome que o `patients` apagou               | **aceito e declarado** — DEBT-01, ALTO, aberto. Nenhuma mitigação nesta sprint             | uso com dado real de paciente (gatilho de reabertura do DEBT-01) |
| Truncate de teste na ordem errada                                     | e2e quebra por FK, como já aconteceu na 04.01                        | item 18: `consultation_notes` antes de `appointments`                                     | `violates foreign key constraint` no `beforeEach`          |
| ~~`cascade` gravando nota órfã ou duplicada~~ — **o risco era real e maior do que a mitigação prevista** | o `cascade` não duplicava: ele **desassociava** as notas que a coleção carregada não listava | Mitigação trocada na fricção PÓS (decisão 18): `cascade` **removido**; `appendNotes` grava só o que não tem `id`. Travado por e2e com 3 anotações sequenciais + contagem no banco | `appointment_id` nulo em `consultation_notes` — hoje barrado pelo `NOT NULL`, que foi a rede |
| Anotação virando "agregado por acidente"                              | quarto repositório, fronteira do `§dominios` rompida                 | checklist: **não existe** `ConsultationNoteRepository`                                     | qualquer arquivo `consultation-note.repository.ts`         |

<!-- /§riscos -->
