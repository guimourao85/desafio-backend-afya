# Sprint 04.01 — Agenda: agendar, reagendar, concluir e cancelar (F4)

> Sumário:
> - §contexto — **auto-contido**: o que F3 deixou pronto, o DDL alvo, as APIs verificadas e as assinaturas fixadas
> - §objetivo — a regra que diferencia esta API de um CRUD gerado
> - §decisoes — 24 decisões; quatro nasceram da fricção PRÉ
> - §nomes — 1 tabela, 6 constraints, 5 services, 5 controllers
> - §escopo — 25 passos
> - §edge-cases — 23 casos
> - §checklist — o gate pré-fechamento
> - §scores — fricção PRÉ e PÓS
> - §issues — o que aparecer durante a implementação
>
> **Plano canônico:** [PLAN.md §13 — F4](../../PLAN.md) · **Estado:** [PRODUCT.md §roadmap](../../PRODUCT.md) · **Formato:** [SPRINT-TEMPLATE.md](../../SPRINT-TEMPLATE.md)

**Branch:** `main` · **Início:** 2026-08-09 · **Fase:** F4
**Status:** ✅ fechada em 2026-08-09 — **fricção PRÉ e PÓS aprovadas** (9/10 nos seis agentes em ambas). 3 issues registrados; a decisão 21 da fricção PRÉ acertou a previsão da migration
**Triagem:** COMPLEXO (≈24 arquivos, migration com índice parcial, agregado novo, INV-01 nasce) → plano + fricção PRÉ ≥9/10 + aprovação + implementar + fricção PÓS
**Agentes:** `[Backend]` `[Dominio]` (no limite) · `[Database]` (migration + índice parcial, obrigatório) · `[Seguranca]` (escopo por médico, obrigatório) · `[Produto]` (5 rotas novas, obrigatório) · `[QA]` (fecha F4, obrigatório)

---

<!-- §contexto -->
## Contexto embutido

### O que F3 deixou pronto (verificado no repositório)

| Peça | Onde | Como se usa aqui |
| --- | --- | --- |
| `FindPatientSummaryService` | `services/patients/find-patient-summary.service.ts` | **A única** porta para saber do paciente. Devolve `{ id, name, isAnonymized }` e `Left(ResourceNotFoundError)` para inexistente **ou alheio** |
| `PatientsModule` | exporta os 6 services, **nunca** `PATIENTS_REPOSITORY` | `AppointmentsModule` importa o **módulo** |
| `@CurrentDoctor()` | `framework/authentication/` | a única fonte de `doctorId` |
| `PaginatedPresenter` | `presentation/presenters/paginated.presenter.ts` | o envelope `{data, meta}` já existe — reusar, não recriar |
| `truncateAll` | `test/factories/truncate-all.ts` | **ganha `appointments`** — a lista mora num lugar só (issue 4 de 03.01) |
| Filtro `23505` → 409 | `framework/filters/errors/exception-filter.ts` | já traduz violação de unicidade para `SCHEDULE_CONFLICT` com a mensagem certa |
| `ScheduleConflictError` | `shared/errors/types/index.ts` | **já existe**, sem ninguém que o lance |

### O DDL alvo (PLAN §6.2)

```sql
CREATE TABLE appointments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id    uuid        NOT NULL REFERENCES doctors(id),
  patient_id   uuid        NOT NULL REFERENCES patients(id),
  scheduled_at timestamptz NOT NULL,
  status       varchar(20) NOT NULL DEFAULT 'SCHEDULED',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_appointments_status CHECK (status IN ('SCHEDULED','COMPLETED','CANCELLED'))
);
-- INV-01: a agenda do médico não admite dois compromissos vivos no mesmo instante
CREATE UNIQUE INDEX uk_appointments_doctor_slot
  ON appointments (doctor_id, scheduled_at) WHERE status <> 'CANCELLED';
CREATE INDEX idx_appointments_patient ON appointments (patient_id, scheduled_at);  -- sem DESC (decisão 22)
```

### API de terceiro — verificado na fonte, não suposto

```
typeorm@0.3.20 · PostgresQueryRunner.createIndexSql (linha 2438):

  CREATE ${isUnique ? "UNIQUE " : ""}INDEX "${name}" ON ${table} (${cols})
    ${where ? "WHERE " + where : ""}

→ `@Index(nome, cols, { unique: true, where: "status <> 'CANCELLED'" })` produz
  exatamente o DDL acima. O índice parcial é suportado de ponta a ponta; o que
  **precisa** ser conferido no SQL gerado é se o `where` sobreviveu à entity —
  esquecer a opção compila e produz um índice único TOTAL, que passa a recusar
  reagendar para um horário liberado por cancelamento.
```

### Contrato HTTP (PLAN §9.1, §9.2)

```
POST   /api/appointments          201  400, 401, 404, 409, 422
GET    /api/appointments?from=&to=&patientId=&status=   200  400, 401
GET    /api/appointments/:id      200  401, 404
PATCH  /api/appointments/:id      200  400, 401, 404, 409, 422   ← reagendar e/ou concluir
DELETE /api/appointments/:id      204  401, 404                  ← cancelar, não apagar

// POST
{ "patientId": "uuid", "scheduledAt": "2026-08-12T14:00:00.000Z" }
// PATCH — patientId NÃO muda: cancele e agende de novo
{ "scheduledAt": "2026-08-13T09:00:00.000Z", "status": "COMPLETED" }
```

### A invariante que nasce aqui

**INV-01** — *um médico não tem dois agendamentos **não cancelados** no mesmo
instante*. Enforcement em **duas camadas**, e as duas são obrigatórias:

| Camada | O que faz | Por que não basta sozinha |
| --- | --- | --- |
| Caso de uso (`findActiveBySlot`) | Devolve 409 com mensagem humana | Duas requisições simultâneas passam as duas pela verificação antes de qualquer uma gravar |
| Índice único parcial | O banco recusa a segunda gravação | Sozinho, o erro chega como violação de constraint — o filtro traduz, mas a mensagem vem do catálogo, não do caso de uso |

> **O teste de concorrência não é desta sprint** (decisão do usuário, 09/08/2026 —
> `PLAN.md §13 F4`). A **regra** entra inteira aqui, com as duas camadas; a **prova
> sob corrida** fica para depois. O índice já fecha a corrida desde hoje: o que falta
> é o teste que a exercita.
>
> *(Ele existe desde 10/08/2026, em `test/integration/appointments.e2e-spec.ts`.)*

### Assinaturas fixadas

**A entity** (`model-entities/appointment.entity.ts`) — o gerador depende de cada
decorator. Sem `@OneToMany`: `ConsultationNote` nasce em F5.

```ts
export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity({ name: 'appointments' })
// INV-01 no banco. O `where` é o que permite reagendar para um horário que um
// cancelamento liberou — sem ele, o slot fica queimado para sempre.
@Index('uk_appointments_doctor_slot', ['doctorId', 'scheduledAt'], {
  unique: true,
  where: `status <> 'CANCELLED'`,
})
// Motivo: performance. Serve ao filtro por paciente desta sprint e à linha do
// tempo de F5 — as duas leem do mais recente para trás. Sem `DESC` porque
// `IndexOptions` não expressa direção por coluna, e o Postgres varre btree para
// trás com o mesmo custo (decisão 22). `PLAN.md §6.2` é corrigido no fechamento.
@Index('idx_appointments_patient', ['patientId', 'scheduledAt'])
@Check('ck_appointments_status', `status IN ('SCHEDULED','COMPLETED','CANCELLED')`)
export class Appointment {
  @PrimaryGeneratedColumn('uuid', { name: 'id', primaryKeyConstraintName: 'pk_appointments' })
  id!: string;

  @Column({ name: 'doctor_id', type: 'uuid' })  doctorId!: string;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ name: 'status', type: 'varchar', length: 20, default: AppointmentStatus.SCHEDULED })
  status!: AppointmentStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;

  isActive(): boolean { return this.status !== AppointmentStatus.CANCELLED; }
  isTerminal(): boolean { return this.status !== AppointmentStatus.SCHEDULED; }

  /** Os três guardas de estado (decisões 6 e 23). Terminal não volta atrás. */
  rescheduleTo(instant: Date): Either<BusinessRuleViolationError, void>
  complete(): Either<BusinessRuleViolationError, void>
  /**
   * `Left` só para `COMPLETED` — cancelar o que já foi atendido apagaria o
   * registro de que o atendimento aconteceu. Já cancelado devolve `Right` sem
   * tocar em nada: repetição de rede não é erro (204 nas duas).
   */
  cancel(): Either<BusinessRuleViolationError, void>
}
```

**A porta** (`repositories/appointment.repository.ts`) — `doctorId` em **todo** método:

```ts
export interface AppointmentFilters {
  doctorId: string;
  from?: Date;
  to?: Date;
  patientId?: string;
  status?: AppointmentStatus;
  page: number;
  perPage: number;
}

export interface AppointmentRepository {
  create(appointment: Appointment): Promise<Appointment>;
  save(appointment: Appointment, doctorId: string): Promise<Appointment>;
  findByIdForDoctor(id: string, doctorId: string): Promise<Appointment | null>;
  /** INV-01, 1ª camada: consulta **viva** do médico exatamente neste instante. */
  findActiveBySlot(doctorId: string, scheduledAt: Date, ignoreId?: string): Promise<Appointment | null>;
  list(filters: AppointmentFilters): Promise<{ items: Appointment[]; total: number }>;
}
```

**Os cinco casos de uso:**

```ts
ScheduleAppointmentService  ({ doctorId, patientId, scheduledAt })
  → Either<ResourceNotFoundError | BusinessRuleViolationError | ScheduleConflictError, Appointment>
  //  1. patients.execute({doctorId, patientId}) → Left ⇒ propaga o 404
  //  2. summary.isAnonymized ⇒ Left(BusinessRuleViolation, INV-02)
  //  3. findActiveBySlot ⇒ Left(ScheduleConflict, INV-01)
  //  4. create()

ListAppointmentsService  ({ doctorId, from?, to?, patientId?, status?, page, perPage })
  → { items, total }                                    // sem Either: lista vazia é resultado

GetAppointmentService    ({ doctorId, appointmentId })  → Either<ResourceNotFoundError, Appointment>

UpdateAppointmentService ({ doctorId, appointmentId, scheduledAt?, status? })
  → Either<ResourceNotFoundError | BusinessRuleViolationError | ScheduleConflictError, Appointment>
  //  reagenda e/ou conclui — a ordem importa: conflito de slot antes de mudar estado

CancelAppointmentService ({ doctorId, appointmentId })
  → Either<ResourceNotFoundError | BusinessRuleViolationError, void>   // 422 se concluída
```
<!-- /§contexto -->

---

<!-- §objetivo -->
## Objetivo

O médico passa a operar a agenda: marca consulta para um paciente seu, vê o que tem
no período, reagenda, conclui e cancela.

É a sprint da **regra que diferencia esta API de um CRUD gerado**: dois agendamentos
vivos no mesmo instante são recusados com 409, e cancelar libera o horário de volta.
O roteiro do avaliador (`PLAN.md §15`) tem esse passo — *agendar de novo no mesmo
horário e ver o 409* — e é o que ele vai procurar.

**Módulos impactados:** nasce o `AppointmentsModule`, o primeiro que **importa outro
módulo de domínio**. Tocam `shared/constants/repositories.ts`, `model-entities/`,
`infrastructure/.../repositories/`, `presentation/presenters/`, `HttpModule` e
`truncateAll`.

**Risco principal:** o `where` do índice parcial. Esquecer a opção compila, gera um
índice único **total**, e a API passa a recusar reagendamento para horário liberado
por cancelamento — um defeito que só aparece no terceiro passo de um fluxo.
**Risco número dois:** a fronteira. `AppointmentsModule` precisa de dado de paciente,
e o caminho fácil (injetar `PATIENTS_REPOSITORY` ou dar `JOIN` em `patients`) fura o
agregado e é caro de desfazer.

**Fora do escopo desta sprint:**

| Item | Vai para |
| --- | --- |
| Anotações (`consultation_notes`, `addNote`, `@OneToMany`) | **04.02 (F5)** |
| `GET /api/patients/:id/appointments` (linha do tempo) | 04.02 (F5) |
| **Teste de duas requisições concorrentes no mesmo slot** | **fora desta sprint** — decisão do usuário; a regra fica, a prova sob corrida sai. Hoje em `appointments.e2e-spec.ts` |
| Sobreposição por duração (consulta como intervalo) | DEBT-02 |
| Fuso do consultório | DEBT-10 |
| `Idempotency-Key` no POST | **DEBT-05** |
<!-- /§objetivo -->

---

<!-- §decisoes -->
## Decisões de execução

| # | Decisão | Escolha | Rationale | Alternativa descartada |
| --- | --- | --- | --- | --- |
| 1 | INV-01 em duas camadas | Verificação no caso de uso **e** índice único parcial | O caso de uso dá 409 com mensagem humana; o índice fecha a corrida que a verificação não fecha. Nenhuma das duas é redundante — elas cobrem falhas diferentes | Só a verificação (perde a corrida) · só o índice (mensagem vinda do tradutor de erro do banco) |
| 2 | O `where` do índice | `status <> 'CANCELLED'`, **conferido no SQL gerado** | Sem ele o índice é único total: cancelar não liberaria o horário, e reagendar para lá responderia 409 para sempre. Compila igual — só o SQL denuncia | Índice único total + filtrar cancelados na aplicação: a corrida volta |
| 3 | Teste de concorrência | **Fora desta sprint** | Decisão do usuário em 09/08/2026, registrada em `PLAN.md §13 F4`. A regra e o índice entram inteiros; o que sai é o teste mais frágil da suíte | Entregar sem o índice também: aí a regra não existiria |
| 4 | Dado de paciente | **`FindPatientSummaryService`**, injetado do `PatientsModule` | É a API pública do módulo (`PRODUCT.md §dominios`), criada em 03.01 exatamente para isto. Ela já devolve 404 para inexistente **e** para alheio — INV-04 vem de graça | Injetar `PATIENTS_REPOSITORY` ou `JOIN` em `patients`: fura o agregado e cria a dependência que a fronteira existe para impedir |
| 5 | Agendar para paciente anonimizado | **422** `BUSINESS_RULE_VIOLATION` (INV-02) | `PRODUCT.md §regras` fixa o texto: "Paciente anonimizado (LGPD) não pode receber novos agendamentos." O paciente existe — recusar com 404 mentiria | 404: esconderia a razão real |
| **6** | Os guardas de estado | Na **entity**: `rescheduleTo()` e `complete()` devolvem `Either`; `cancel()` é `void` e idempotente | Regra sobre o próprio estado mora na entity (mesma razão de `Patient.anonymize()`). `cancel()` não devolve erro porque cancelar cancelado é no-op — 204 nas duas | Guardas no caso de uso: a entity vira saco de setters, e a máquina de estados se espalha por três services |
| 7 | Divergência de `PLAN.md §11.3` | Lá os métodos são `void`; aqui `rescheduleTo` e `complete` devolvem `Either` | `§11.3` é **esboço de padrão**; `§13 F4` item 3 é o contrato, e diz "devolvem `Left(BusinessRuleViolationError)` a partir de estado terminal". Onde os dois divergem, vence o §13. `§11.3` é corrigido no fechamento | Seguir o esboço: perderia a recusa de operar consulta terminal |
| **8** | Um service para o `PATCH` | **`UpdateAppointmentService`**, divergindo do §13 (que lista `RescheduleAppointment`) | O contrato de `§9.2` funde reagendar e concluir num `PATCH` só. Dois services obrigariam o controller a decidir qual chamar pelo payload — regra de negócio migrando para o transporte —, ou a escrever duas vezes no mesmo agregado | `RescheduleAppointmentService` + `CompleteAppointmentService`: dois `save` na mesma raiz por uma requisição |
| 9 | Ordem dentro do `PATCH` | Conflito de slot **antes** de mudar estado | Reagendar para horário ocupado é 409; se o estado mudasse primeiro, uma requisição recusada teria deixado rastro | Aplicar tudo e deixar o banco decidir |
| 10 | `status` aceito no `PATCH` | Só **`COMPLETED`** | Cancelar é `DELETE` (verbo semântico), e voltar para `SCHEDULED` não é operação do domínio — consulta concluída não "desconclui" | Aceitar os três: daria dois caminhos para cancelar e um para desfazer conclusão |
| 11 | `patientId` no `PATCH` | **Não muda** — o campo nem existe no schema | `PLAN.md §9.2` é explícito: cancele e agende de novo. Trocar o paciente de uma consulta é reescrever o histórico de atendimento de duas pessoas | Aceitar `patientId`: silencioso e destrutivo |
| 12 | Reagendar consulta terminal | **422**, não 409 nem 404 | O recurso existe e o horário pode estar livre — o que recusa é a regra de estado. `[Produto]` decide o que o cliente vê; `[Dominio]` já decidiu que não pode | 409: confundiria o cliente sobre a causa |
| 13 | `DELETE` = cancelar | Status vira `CANCELLED`, linha permanece; **204** | `PRODUCT.md §regras`: excluir agendamento significa cancelar. Apagar destruiria a trilha e liberaria o slot por remoção em vez de por regra | `DELETE` físico |
| 14 | Cancelar já cancelado | **204**, sem tocar o banco | Idempotente por `PRODUCT.md §regras`. Repetição de rede não é erro do usuário | 422 na segunda |
| 15 | `scheduledAt` no passado | **Permitido** | O desafio não pede consulta futura, e registrar atendimento retroativo é caso real de prontuário. Recusar inventaria uma regra que ninguém pediu — e quebraria seed e demonstração | `CHECK (scheduled_at > now())`: não é `IMMUTABLE` e ainda inventaria regra |
| 16 | Filtros da listagem | `from`, `to` (instantes), `patientId`, `status` — todos opcionais, combináveis | É o que `PLAN.md §9.1` publica. Sem filtro, lista tudo do médico paginado | Filtro obrigatório de período: quebraria a tela de agenda inicial |
| 17 | Ordenação da listagem | `scheduled_at ASC`, desempate por `id` | Agenda se lê do próximo para o fim. Desempate explícito porque o Postgres não promete ordem entre iguais, e sem ele a paginação repete linha | Sem `ORDER BY` |
| 18 | Envelope da listagem | `PaginatedPresenter`, o mesmo de pacientes | Envelope único para toda a API (`§9.3`). O presenter genérico existe desde 03.01 exatamente para não haver um segundo formato | Envelope próprio de agenda |
| 19 | O que o presenter devolve | `patientId` (string), **não** o paciente embutido | Agregados se referenciam por ID (ADR-04). Embutir o paciente aqui criaria o join que a fronteira impede, e a tela que precisa do nome busca o paciente | `patient: { id, name }`: conveniente e fura o ADR |
| 20 | DEBT-12 | **Continua declarado**, não reaberto | `uk_appointments_doctor_slot` é a **primeira** constraint `UNIQUE` alcançável por endpoint. O gatilho do débito é a **segunda** — enquanto for só ela, a mensagem do filtro está sempre certa | Mapear constraint → mensagem agora: nome de índice vazando para a borda HTTP |
| **21** | A migration virá com **dois** `DROP CONSTRAINT` | Remover as duas linhas na revisão e conferir `pg_constraint` depois | Armadilha de `PLAN.md §16.4`, descoberta em 03.01: o gerador derruba toda FK escrita à mão. Agora existem duas (`fk_refresh_tokens_doctors`, `fk_patients_doctors`), e esta migration acrescenta mais duas | Confiar que o gerador aprendeu |
| **22** | `idx_appointments_patient` sai **sem `DESC`** | O índice é `(patient_id, scheduled_at)`, e `PLAN.md §6.2` é corrigido | **Verificado**: `IndexOptions` do `typeorm@0.3.20` não tem opção de direção por coluna — o `DESC` do DDL alvo não é expressável no decorator. E não faz falta: o Postgres varre índice btree **para trás** com o mesmo custo, então `ORDER BY scheduled_at DESC` usa este índice igual. Manter o `DESC` no doc seria descrever um schema que não existe | Escrever o índice à mão na migration só pelo `DESC`: entity deixaria de ser a fonte do DDL (ADR-03) por ganho zero |
| **23** | Cancelar consulta **concluída** | **422**, não 204. `cancel()` devolve `Either`: `Left` para `COMPLETED`, `Right` no-op para `CANCELLED` | O §edge-cases desta sprint nasceu **se contradizendo** — o caso 11 dizia "204" e "Não: 422" na mesma linha. Resolvido pelo domínio: cancelar o que já foi atendido apagaria o registro de que o atendimento aconteceu. Já cancelado continua 204, porque aí a repetição não destrói nada | `cancel(): void` do §11.3: silenciosamente cancelaria consulta concluída |
| **24** | Textos das recusas de estado | Reagendar terminal → **"Consulta cancelada ou concluída não pode ser reagendada."** · Concluir terminal → **"Só uma consulta agendada pode ser concluída."** · Cancelar concluída → **"Consulta já concluída não pode ser cancelada."** | `PRODUCT.md §regras` **não tem** nenhuma das três — a tabela cobre anotar em cancelada, não operar agendamento terminal. Mesmo padrão do achado de 03.01: improvisar na implementação daria três textos para a mesma família de erro. As três entram na `§regras` no fechamento | Deixar para a implementação escolher |
<!-- /§decisoes -->

---

<!-- §nomes -->
## Nomes fixados

### Banco

| Tipo | Nome | Observação |
| --- | --- | --- |
| Tabela | `appointments` | |
| PK | `pk_appointments` | |
| FK | `fk_appointments_doctors` · `fk_appointments_patients` | **as duas à mão** na revisão |
| Check | `ck_appointments_status` | `@Check` nomeado |
| Índice único parcial | `uk_appointments_doctor_slot` | `(doctor_id, scheduled_at) WHERE status <> 'CANCELLED'` — **integridade** (INV-01) |
| Índice | `idx_appointments_patient` | `(patient_id, scheduled_at DESC)` — **performance**: filtro por paciente aqui, linha do tempo em F5 |
| Migration | `<timestamp>-appointments.ts` | gerada, revisada, forward-only |

### Código

| Tipo | Nome | Onde |
| --- | --- | --- |
| Token DI | `APPOINTMENTS_REPOSITORY` | `shared/constants/repositories.ts` |
| Entity | `Appointment` · enum `AppointmentStatus` | `domains/domain/model-entities/` |
| Porta | `AppointmentRepository` | `domains/domain/repositories/` |
| Adapter | `TypeOrmAppointmentRepository` | `infrastructure/.../repositories/` |
| Módulo | `AppointmentsModule` + `appointmentsProviders` | `domains/domain/services/appointments/` |
| Service | `ScheduleAppointmentService` · `ListAppointmentsService` · `GetAppointmentService` · `UpdateAppointmentService` · `CancelAppointmentService` | `domains/domain/services/appointments/` |
| Controller | `ScheduleAppointmentController` · `ListAppointmentsController` · `GetAppointmentController` · `UpdateAppointmentController` · `CancelAppointmentController` | `gateways/http/controllers/domain/appointments/` |
| DTO | `ScheduleAppointmentDto` · `UpdateAppointmentDto` · `ListAppointmentsQueryDto` | `gateways/http/schemas/domain/appointment.schema.ts` |
| Presenter | `AppointmentPresenter` | `presentation/presenters/` |
<!-- /§nomes -->

---

<!-- §escopo -->
## Escopo — plano ordenado

| # | Ação | Arquivo | Tipo | Depende de |
| --- | --- | --- | --- | --- |
| 1 | Editar | `shared/constants/repositories.ts` — `APPOINTMENTS_REPOSITORY` | ALTER | — |
| 2 | Criar | `model-entities/appointment.entity.ts` — **código no §contexto** | NOVO | — |
| 3 | Editar | `model-entities/index.ts` — `Appointment` **por último** (FK para `patients`) | ALTER | 2 |
| 4 | Gerar | `npm run migration:generate --name=appointments` | NOVO | 3 |
| 5 | **Revisar** | remover os **dois** `DROP CONSTRAINT` (decisão 21); acrescentar as duas FKs à mão no `up()` e no `down()`; conferir o `WHERE` do índice parcial | ALTER | 4 |
| 6 | Verificar | `migration:run` nos dois bancos · `\d appointments` · `pg_constraint` com as **quatro** FKs vivas | — | 5 |
| 7 | Criar | `repositories/appointment.repository.ts` — porta do §contexto | NOVO | 2 |
| 8 | Criar | `infrastructure/.../repositories/typeorm-appointment.repository.ts` — todo `where` com `doctorId` | NOVO | 7 |
| 9 | Criar | `services/appointments/schedule-appointment.service.ts` | NOVO | 7 |
| 10 | Criar | `services/appointments/get-appointment.service.ts` | NOVO | 7 |
| 11 | Criar | `services/appointments/list-appointments.service.ts` | NOVO | 7 |
| 12 | Criar | `services/appointments/update-appointment.service.ts` (decisões 8 e 9) | NOVO | 7 |
| 13 | Criar | `services/appointments/cancel-appointment.service.ts` | NOVO | 7 |
| 14 | Criar | `services/appointments/appointments.provider.ts` + `appointments.module.ts` — **importa `PatientsModule`** | NOVO | 8–13 |
| 15 | Criar | `gateways/http/schemas/domain/appointment.schema.ts` — 3 DTOs `.strict()` com mensagem PT-BR | NOVO | — |
| 16 | Criar | `presentation/presenters/appointment.presenter.ts` | NOVO | 2 |
| 17 | Criar | os 5 controllers + `index.ts` | NOVO | 9–16 |
| 18 | Editar | `http.module.ts` — importa `AppointmentsModule`, registra os 5 controllers | ALTER | 14, 17 |
| 19 | Editar | `test/factories/truncate-all.ts` — `appointments` **antes** de `patients` | ALTER | 6 |
| 20 | Criar | 5 `*.spec.ts` ao lado dos services + `appointment.entity.spec.ts` (a máquina de estados) | NOVO | 9–13 |
| 21 | Criar | `test/factories/in-memory-appointment.repository.ts` | NOVO | 7 |
| 22 | Criar | `test/integration/appointments.e2e-spec.ts` | NOVO | 18 |
| 23 | Verificar | **404 cross-doctor** nas 3 rotas com `:id` + agendar para paciente de outro médico | — | 22 |
| 24 | Verificar | **`curl` rota a rota** contra a API no ar, incluindo o 409 e o slot liberado por cancelamento | — | 18 |
| 25 | Editar | `PLAN.md §11.3` — os guardas devolvem `Either` (decisão 7) | ALTER | — |

**Commits sugeridos:** `feat: tabela de agendamentos com indice de horario unico` ·
`feat: agendamento com recusa de horario ocupado` · `feat: listagem da agenda com filtros` ·
`feat: reagendar, concluir e cancelar consulta` · `test: integracao da agenda`
<!-- /§escopo -->

---

<!-- §edge-cases -->
## Edge cases

| # | Caso | Comportamento esperado | Coberto por |
| --- | --- | --- | --- |
| 1 | Agendar em horário livre | **201** | e2e |
| 2 | Mesmo médico, mesmo instante, consulta viva | **409** `SCHEDULE_CONFLICT` | INV-01, unit + e2e |
| 3 | **Outro** médico, mesmo instante | **201** — a agenda é por médico | INV-01 + e2e |
| 4 | Cancelar e agendar de novo no mesmo horário | **201** — é o `WHERE` do índice provando que existe | decisão 2 + e2e |
| 5 | Reagendar para horário ocupado | **409** | e2e |
| 6 | Reagendar para o **próprio** horário atual | **200**, sem conflito consigo mesma (`ignoreId`) | decisão 9 + unit |
| 7 | Reagendar consulta cancelada ou concluída | **422** | decisões 6 e 12 + unit |
| 8 | Concluir consulta cancelada | **422** | decisão 6 + unit |
| 9 | Concluir consulta já concluída | **422** — terminal não reprocessa | decisão 6 |
| 10 | Cancelar consulta já cancelada | **204**, e `updated_at` não muda | decisão 14 + e2e |
| 11 | Cancelar consulta **concluída** | **422** — cancelar o que já foi atendido apagaria o registro de que o atendimento aconteceu | decisão 23 + unit |
| 12 | Agendar para paciente inexistente | **404** | decisão 4 + e2e |
| 13 | Agendar para paciente **de outro médico** | **404**, idêntico ao inexistente | INV-04 + e2e |
| 14 | Agendar para paciente anonimizado | **422** com o texto de `PRODUCT.md §regras` | INV-02 + e2e |
| 15 | `GET`/`PATCH`/`DELETE` de agendamento de outro médico | **404** nas três, e a linha alheia não muda | INV-04 + e2e |
| 16 | Listagem com dois médicos na base | Cada um vê só a sua agenda; `meta.total` idem | INV-04 + e2e |
| 17 | `?from=` maior que `?to=` | **400** — intervalo impossível é payload malformado | schema |
| 18 | `?status=ALIEN` | 400 | schema |
| 19 | `scheduledAt` em formato não ISO | 400 | schema |
| 20 | `scheduledAt` no passado | **201** — permitido por decisão 15 | decisão 15 |
| 21 | `patientId` no corpo do `PATCH` | **400** — `.strict()`, o campo não existe lá | decisão 11 |
| 22 | `PATCH` com corpo vazio | 400 | schema |
| 23 | Qualquer rota sem token | 401 | 02.02 + e2e |

> INV-05 não entra: anotação é F5. INV-03 passa a ser **exercitável** aqui — anonimizar
> um paciente com agenda e conferir que a contagem de consultas não muda —, e esse
> teste fecha a lacuna declarada no edge case 7 de 03.01.
<!-- /§edge-cases -->

---

<!-- §checklist -->
## Checklist anti-erro (pré-fechamento)

**Verde**
- [x] `lint` + `typecheck` + `build` + `test` + `test:e2e`
- [x] `curl` rota a rota na API no ar, incluindo o 409 e o slot liberado por cancelamento

**Banco** (veto `[Database]`)
- [x] SQL revisado linha a linha contra o DDL do §contexto
- [x] **O `WHERE status <> 'CANCELLED'` saiu no `CREATE UNIQUE INDEX`** — conferido no arquivo e com `\d appointments`
- [x] Os **dois** `DROP CONSTRAINT` do gerador foram removidos (decisão 21)
- [x] `pg_constraint` mostra as **quatro** FKs vivas depois de aplicar
- [x] `pk_appointments` · `fk_appointments_doctors` · `fk_appointments_patients` · `ck_appointments_status` · `uk_appointments_doctor_slot` · `idx_appointments_patient` com os nomes exatos
- [x] Os dois índices com **motivo declarado em comentário** na migration
- [x] `down()` testado com `migration:revert` → `migration:run`, nos dois bancos

**Segurança** (veto `[Seguranca]`)
- [x] Todo método do adapter filtra `doctorId`
- [x] `doctorId` só de `@CurrentDoctor()`
- [x] 404 (não 403) em `GET`/`PATCH`/`DELETE` de agendamento alheio, e a linha alheia intacta
- [x] Agendar para paciente alheio → 404, pela porta do `PatientsModule`
- [x] Nenhum log com nome de paciente — só ID

**Domínio e arquitetura**
- [x] Os três guardas moram na **entity**, não nos services
- [x] `AppointmentsModule` importa **`PatientsModule`** e injeta `FindPatientSummaryService` — nunca `PATIENTS_REPOSITORY`, nunca `JOIN` em `patients`
- [x] Nenhuma transação: cada operação toca uma linha de um agregado
- [x] `AppointmentPresenter` devolve `patientId`, não o paciente embutido
- [x] Services sem ORM — lint verde

**Contrato** (`[Produto]`)
- [x] 201 · 200 · 200 · 200 · **204**, conforme `§9.1`
- [x] Envelope `{data, meta}` pelo `PaginatedPresenter`, sem formato novo
- [x] 409 com "Já existe um agendamento neste horário." e 422 com os textos de `§regras`
- [x] As 5 rotas em `/api/docs` com `@ApiBearerAuth()` e exemplos de 409 e 422
- [x] O roteiro de `PLAN.md §15` funciona até o passo do 409

**Testes** (`[QA]`, fecha F4)
- [x] 409 no mesmo slot · 201 para outro médico · cancelar libera · reagendar para ocupado → 409
- [x] Máquina de estados com spec próprio da entity
- [x] **INV-03 exercitada**: anonimizar paciente com agenda não muda a contagem de consultas
- [x] Nenhum registro compartilhado entre casos
- [x] Declarado no doc que o teste concorrente é de fora desta sprint — não marcado como coberto

**Plano**
- [x] `PLAN.md §11.3` corrigido (decisão 7)
- [x] `PRODUCT.md §roadmap`: 04.01 → ✅
- [x] Débito novo, se houver, com gatilho de reabertura
<!-- /§checklist -->

---

<!-- §scores -->
## Scores de fricção

### Fricção PRÉ — 2026-08-09

| Agente | Fase | Score | Severidade máxima | Observação |
| --- | --- | --- | --- | --- |
| `[Dominio]` | PRÉ | **7/10 → 9/10** | ALTO (1) | REJECTED na 1ª passada: o §edge-cases nascia **se contradizendo** — o caso 11 dizia "204" e "**Não**: 422" na mesma linha, para cancelar consulta concluída. Não é typo, é decisão não tomada: com `cancel(): void` do §11.3, cancelar o que já foi atendido **apagaria em silêncio** o registro de que o atendimento aconteceu. Resolvido pela decisão 23 — `cancel()` devolve `Either`, `Left` para `COMPLETED` e `Right` no-op para `CANCELLED`, preservando a idempotência onde ela não destrói nada |
| `[Database]` | PRÉ | **8/10 → 9/10** | MÉDIO (1) | MÉDIO: a entity do §contexto não produzia o `DESC` de `idx_appointments_patient` — e **`IndexOptions` do `typeorm@0.3.20` não tem opção de direção**, verificado no typing. Entity divergindo do DDL alvo é achado CRÍTICO por `review-database.md §regras` item 8; aqui a saída certa é corrigir o **alvo**, porque o Postgres varre btree para trás com o mesmo custo. Passou: índice parcial confirmado na fonte do driver, `varchar`+`CHECK`, `timestamptz`, os dois `DROP CONSTRAINT` já previstos pela decisão 21 |
| `[Produto]` | PRÉ | **8/10 → 9/10** | MÉDIO (1) | MÉDIO: **três** recusas de estado sem texto definido, e nenhuma existe em `PRODUCT.md §regras` — a tabela cobre anotar em consulta cancelada, não operar agendamento terminal. Mesmo padrão do achado de 03.01. Fixados pela decisão 24, com a `§regras` corrigida no fechamento. Passou: status conforme `§9.1`, envelope reusado, `DELETE` = cancelar |
| `[Seguranca]` | PRÉ | **9/10** | — | INV-04 coberto nas 3 rotas com `:id` **e** no caminho que mais importa: agendar para paciente de outro médico responde 404 porque a consulta passa pela porta do `PatientsModule`, que já filtra por dono. `doctorId` só de `@CurrentDoctor()`; `save` com o dono no `where`; nenhum log com nome de paciente |
| `[Backend]` | PRÉ | **9/10** | BAIXO (1) | A fronteira está certa onde ela é testada pela primeira vez: `AppointmentsModule` importa `PatientsModule` e injeta o service público, sem `JOIN` e sem token alheio. BAIXO (resolvido no doc): `UpdateAppointmentService` diverge do nome que `§13 F4` lista — declarado na decisão 8, com a razão (o `PATCH` funde reagendar e concluir, e dois services fariam o controller escolher pelo payload) |
| `[QA]` | PRÉ | **9/10** | BAIXO (1) | O gate cobre os quatro casos de INV-01, inclusive "cancelar libera o slot", que é o único que prova o `WHERE` do índice parcial. **INV-03 finalmente exercitável** — anonimizar paciente com agenda e conferir que a contagem de consultas não muda —, fechando a lacuna declarada no edge case 7 de 03.01. BAIXO: o checklist precisou dizer explicitamente que o teste concorrente **não** está coberto, para o item não ser lido como esquecimento |

**Conflitos entre agentes:** nenhum. O achado do `[Dominio]` e o do `[Produto]` se
tocam (os dois falam de recusa de estado), mas em camadas diferentes: um decide que
não pode, o outro decide o que o cliente lê.

**Verificado antes de decidir, não inferido:**

```
typeorm/driver/postgres/PostgresQueryRunner.js:2438 — createIndexSql
  → `CREATE ${isUnique?"UNIQUE ":""}INDEX "${name}" ON ${t} (${cols}) ${where?"WHERE "+where:""}`
  → o índice parcial é emitido de ponta a ponta; o risco é o `where` sumir da
    entity, não o driver ignorá-lo

typeorm/decorator/options/IndexOptions.d.ts
  → sem `order` / `direction` / `DESC` — o DDL alvo pedia algo inexpressável
```

### Fricção PÓS — 2026-08-09

| Agente | Fase | Score | Severidade máxima | Observação |
| --- | --- | --- | --- | --- |
| `[Database]` | PÓS | **9/10** | ALTO (1, evitado) | A previsão da decisão 21 **acertou**: a migration veio com dois `DROP CONSTRAINT`, removidos na revisão, e `pg_constraint` mostra as **quatro** FKs vivas. `\d appointments` confere `uk_appointments_doctor_slot UNIQUE, btree (doctor_id, scheduled_at) WHERE status::text <> 'CANCELLED'::text` — o `WHERE` chegou ao banco. Os dois índices com motivo em comentário; `ck_appointments_status` com a expressão do §6.2 |
| `[Dominio]` | PÓS | **9/10** | — | A máquina de estados tem spec próprio, com os três estados × três operações. A assimetria do `cancel()` — no-op para cancelada, recusa para concluída — está testada nos dois lados. INV-01 nas duas camadas, INV-02 na travessia do módulo, INV-03 exercitada de verdade. Nenhuma transação; nenhum service conhece as transições |
| `[Seguranca]` | PÓS | **9/10** | — | INV-04 provado no e2e e no `curl`: 404 no `GET`, `PATCH` e `DELETE` alheios, com a linha do outro médico conferida no banco depois. E o caminho que mais importa — agendar para paciente de outro médico — responde 404 **sem o service de agenda saber que INV-04 existe**, porque a pergunta passa pela porta do `PatientsModule` |
| `[Backend]` | PÓS | **9/10** | MÉDIO (1) | A fronteira entre módulos nasceu certa no primeiro caso real: `AppointmentsModule` importa `PatientsModule` e injeta o service público, sem `JOIN` e sem token alheio. O spec do `ScheduleAppointmentService` usa o `FindPatientSummaryService` **real**, não um duplo — é o que exercita a travessia. MÉDIO: o alias `@/` não funciona em entity (issue 1), e a descoberta veio como erro de CLI, não do plano |
| `[Produto]` | PÓS | **9/10** | — | 15 operações no OpenAPI, e as 5 da agenda com 409 e 422 documentados com exemplo. Os três textos de recusa saíram como a decisão 24 fixou, e entraram em `PRODUCT.md §regras`. O passo 6 do roteiro do avaliador — *agendar de novo no mesmo horário e ver o 409* — funciona |
| `[QA]` | PÓS | **9/10** | MÉDIO (1) | 111 unitários + 114 e2e. Os quatro casos de INV-01 cobertos, inclusive "cancelar libera o slot" e a recusa do índice **por fora da aplicação**. MÉDIO: `patients.e2e-spec.ts` quebrou inteiro ao nascer a tabela (issue 3) — o helper de `TRUNCATE` existia desde 03.01 e eu não o usei no arquivo que escrevi na mesma sprint |

**Conflitos entre agentes:** nenhum.

**Gates no fechamento:**

```
typecheck ✅  lint ✅  build ✅
test      ✅  19 suítes, 111 casos
test:e2e  ✅   8 suítes, 114 casos
migration ✅  aplicada nos dois bancos; 4 FKs vivas; índice parcial com o WHERE
docs-json ✅  9 caminhos, 15 operações

curl (API no ar):
  201 agendar → 409 mesmo horário → 204 cancelar → 201 de novo no MESMO horário
  200 reagendar para o próprio horário (sem conflitar consigo) → COMPLETED
  422 reagendar concluída · 422 cancelar concluída · 204 cancelar já cancelada
  404 GET/PATCH/DELETE alheios, com a consulta do outro médico intacta (SCHEDULED)
  404 agendar para paciente alheio · 422 para paciente anonimizado
  INV-03: 2 consultas antes da anonimização, 2 depois
  banco: INSERT direto duplicado → duplicate key on uk_appointments_doctor_slot
```

**Dados de teste removidos do banco de dev** ao fim: sobrou só o médico do seed.
<!-- /§scores -->

---

<!-- §issues -->
## Issues encontrados durante a implementação

| # | Descoberta | Causa raiz | Solução | Arquivos | Virou |
| --- | --- | --- | --- | --- | --- |
| **1** | **`migration:generate` morreu** com `Cannot find module '@/shared/errors/either'` | A entity nova é a primeira a importar de fora da própria pasta, e o `typeorm-ts-node-commonjs` carrega a entity **fora do runtime do Nest** — sem `tsconfig-paths`, o alias `@/` não existe para ele. As entities anteriores nunca esbarraram nisso porque só importavam vizinhos | Import **relativo** (`../../../shared/errors/...`) na entity. Não mexer no script de migration foi decisão consciente: é a parte mais sensível do projeto, e a alternativa custa uma linha | `appointment.entity.ts` | **Armadilha nova em `PLAN.md §16.4`:** entity não usa `@/`. Vale para `ConsultationNote` em F5 |
| **2** | A migration veio com **dois** `DROP CONSTRAINT` — `fk_patients_doctors` e `fk_refresh_tokens_doctors` | A armadilha de 03.01, agora crescida: o gerador derruba **toda** FK escrita à mão, e já eram duas | Removidas do `up()` e do `down()`. Conferido depois: `pg_constraint` devolve as **quatro** | `1786310600161-sprint04.01-appointments.ts` | Previsto pela decisão 21 — **a fricção PRÉ acertou**. Da próxima serão quatro `DROP` |
| **3** | `patients.e2e-spec.ts` quebrou inteiro ao nascer `appointments` — `cannot truncate a table referenced in a foreign key constraint` | Eu criei o `truncateAll` em 03.01 **e não o usei no arquivo que escrevi na mesma sprint**: o `TRUNCATE` inline ficou lá. A suíte de autenticação, que passou a usar o helper, atravessou sem uma linha de mudança | `patients.e2e-spec.ts` passou a usar `truncateAll` | `patients.e2e-spec.ts`, `truncate-all.ts` | O helper provou o próprio valor no primeiro teste real — e provou também que criar a abstração não basta: quem não a adota fica de fora da proteção |

> Preencher **durante** a sprint, não no fechamento.
<!-- /§issues -->
