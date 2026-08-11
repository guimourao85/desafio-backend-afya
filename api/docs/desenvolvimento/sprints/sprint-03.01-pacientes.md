# Sprint 03.01 — Pacientes: cadastro, perfil e anonimização (F3)

> Sumário:
> - §contexto — **auto-contido**: o que F2 deixou pronto, o DDL alvo e as assinaturas fixadas para copiar
> - §objetivo — o primeiro dado clínico do sistema, e o primeiro escopado por médico
> - §decisoes — 24 decisões; seis nasceram da fricção PRÉ
> - §nomes — 1 tabela, 5 constraints, 6 services, 5 controllers
> - §escopo — 24 passos: constante → entity → migration → porta → adapter → service → HTTP → teste
> - §edge-cases — 22 casos
> - §checklist — o gate pré-fechamento
> - §scores — fricção PRÉ e PÓS
> - §issues — o que aparecer durante a implementação
>
> **Plano canônico:** [PLAN.md §13 — F3](../../PLAN.md) · **Estado:** [PRODUCT.md §roadmap](../../PRODUCT.md) · **Formato:** [SPRINT-TEMPLATE.md](../../SPRINT-TEMPLATE.md)

**Branch:** `main` · **Início:** 2026-08-09 · **Fase:** F3
**Status:** ✅ fechada em 2026-08-09 — **fricção PRÉ e PÓS aprovadas** (9/10 nos seis agentes em ambas). 5 issues registrados; 1 ALTO de produto corrigido na PÓS, herdado de 02.01
**Triagem:** COMPLEXO (≈22 arquivos, migration nova, agregado novo, INV-02/03/04 em vigor) → plano + fricção PRÉ ≥9/10 + aprovação + implementar + fricção PÓS
**Agentes:** `[Backend]` `[Dominio]` (no limite) · `[Database]` (migration, obrigatório) · `[Seguranca]` (PII/LGPD e escopo por médico, obrigatório) · `[Produto]` (6 rotas novas, obrigatório) · `[QA]` (fecha a fase F3, obrigatório)

---

<!-- §contexto -->
## Contexto embutido

### O que F2 deixou pronto (verificado no repositório)

| Peça | Onde | Como se usa aqui |
| --- | --- | --- |
| `@CurrentDoctor()` | `framework/authentication/current-doctor.decorator.ts` | **A única** fonte de `doctorId` — todo controller desta sprint o recebe |
| `JwtAuthGuard` global | `APP_GUARD` no `HttpModule` | As 6 rotas nascem fechadas: **nenhuma** leva `@Public()` |
| Tokens de DI | `shared/constants/repositories.ts` | Ganha o terceiro: `PATIENTS_REPOSITORY` |
| Padrão de módulo | `services/authentication/{module,provider}.ts` | `PatientsModule` é o espelho |
| Envelope de erro | `framework/filters/errors/exception-filter.ts` | `RESOURCE_NOT_FOUND` → 404 e `BUSINESS_RULE_VIOLATION` → 422 **já mapeados**, sem ninguém que os lance |
| Presenter | `presentation/presenters/doctor.presenter.ts` | `PatientPresenter` é o espelho |

### O DDL alvo (PLAN §6.2) — é contra isto que a migration é revisada

```sql
CREATE TABLE patients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     uuid         NOT NULL REFERENCES doctors(id),
  name          varchar(150) NOT NULL,
  phone         varchar(20),
  email         varchar(255),
  birth_date    date,
  sex           varchar(20),
  height_m      numeric(3,2),
  weight_kg     numeric(5,2),
  anonymized_at timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ck_patients_sex    CHECK (sex IS NULL OR sex IN ('MALE','FEMALE','OTHER','UNDISCLOSED')),
  CONSTRAINT ck_patients_height CHECK (height_m  IS NULL OR (height_m  > 0.30 AND height_m  < 2.60)),
  CONSTRAINT ck_patients_weight CHECK (weight_kg IS NULL OR (weight_kg > 0.50 AND weight_kg < 500)),
  -- Acrescentado na fricção PRÉ desta sprint (achado do [Database], decisão 19).
  CONSTRAINT ck_patients_birth_date CHECK (birth_date IS NULL OR birth_date <= CURRENT_DATE)
);
CREATE INDEX idx_patients_doctor ON patients (doctor_id);
```

### O contrato HTTP (PLAN §9.1, §9.2)

```
POST   /api/patients                     201  400, 401
GET    /api/patients?search=&page=&perPage=  200  400, 401
GET    /api/patients/:id                 200  401, 404
PATCH  /api/patients/:id                 200  400, 401, 404, 422
DELETE /api/patients/:id                 204  401, 404      ← anonimizar, não apagar
GET    /api/patients/:id/appointments    200  401, 404      ← F5, NÃO nesta sprint
```

### As três invariantes que entram em vigor

| ID | O que exige aqui |
| --- | --- |
| **INV-02** | Paciente anonimizado não aceita edição → 422 |
| **INV-03** | Anonimizar **preserva** agendamentos e anotações — só toca colunas de PII |
| **INV-04** | Toda leitura e escrita filtra `doctorId`; recurso alheio responde **404**, não 403 |

### Duas armadilhas do TypeORM que este schema pisa

```
numeric  → volta como STRING sem transformer. `heightM: "1.68"` na resposta é
           achado ALTO do [Produto] (PLAN §6.4). Transformer obrigatório nas duas
           colunas.
date     → volta como STRING 'YYYY-MM-DD', e é isso que o contrato publica.
           A propriedade é tipada `string | null`, NÃO `Date` — tipar como `Date`
           faz o TypeScript mentir sobre o que chega do banco.
```

### Assinaturas fixadas — copiar, não reinventar

**A entity** (`domains/domain/model-entities/patient.entity.ts`). O gerador depende
de cada decorator estar exato:

```ts
@Entity({ name: 'patients' })
@Index('idx_patients_doctor', ['doctorId'])
@Check('ck_patients_sex', `sex IS NULL OR sex IN ('MALE','FEMALE','OTHER','UNDISCLOSED')`)
@Check('ck_patients_height', 'height_m IS NULL OR (height_m > 0.30 AND height_m < 2.60)')
@Check('ck_patients_weight', 'weight_kg IS NULL OR (weight_kg > 0.50 AND weight_kg < 500)')
@Check('ck_patients_birth_date', 'birth_date IS NULL OR birth_date <= CURRENT_DATE')
export class Patient {
  @PrimaryGeneratedColumn('uuid', { name: 'id', primaryKeyConstraintName: 'pk_patients' })
  id!: string;

  /** Referência por ID ao agregado Doctor (ADR-04) — sem `@ManyToOne`. */
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  /** `date` puro: nascimento não tem fuso. Volta do banco como 'YYYY-MM-DD'. */
  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate!: string | null;

  @Column({ name: 'sex', type: 'varchar', length: 20, nullable: true })
  sex!: PatientSex | null;

  @Column({ name: 'height_m', type: 'numeric', precision: 3, scale: 2, nullable: true, transformer: numericTransformer })
  heightM!: number | null;

  @Column({ name: 'weight_kg', type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: numericTransformer })
  weightKg!: number | null;

  @Column({ name: 'anonymized_at', type: 'timestamptz', nullable: true })
  anonymizedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  isAnonymized(): boolean {
    return this.anonymizedAt !== null;
  }

  /** A regra é sobre o próprio estado, então mora aqui (decisão 8). Idempotente. */
  anonymize(at: Date): void {
    if (this.isAnonymized()) return;

    this.name = ANONYMIZED_PATIENT_NAME;
    this.phone = null;
    this.email = null;
    this.birthDate = null;
    this.anonymizedAt = at;
    // sex, heightM e weightKg permanecem: não identificam ninguém sozinhos e são
    // o que resta de valor clínico na linha (decisão 7).
  }
}
```

**O transformer** (`model-entities/numeric.transformer.ts`) — um arquivo, usado pelas
duas colunas e por toda `numeric` futura:

```ts
export const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
};
```

**A porta** (`domains/domain/repositories/patient.repository.ts`). **Todo** método
recebe `doctorId` — é assim que INV-04 deixa de depender de disciplina:

```ts
export interface ListPatientsFilters {
  doctorId: string;
  search?: string;
  page: number;
  perPage: number;
}

export interface PatientPage {
  items: Patient[];
  total: number;
}

export interface PatientRepository {
  create(patient: Patient): Promise<Patient>;
  /** `doctorId` **também** aqui: o UPDATE filtra por `(id, doctor_id)` (decisão 20). */
  save(patient: Patient, doctorId: string): Promise<Patient>;
  findByIdForDoctor(id: string, doctorId: string): Promise<Patient | null>;
  list(filters: ListPatientsFilters): Promise<PatientPage>;
}
```

**Os seis casos de uso** — um `execute` cada, `Either` no retorno:

```ts
RegisterPatientService  ({ doctorId, ...dados })      → Either<never,                        Patient>
GetPatientService       ({ doctorId, patientId })     → Either<ResourceNotFoundError,        Patient>
ListPatientsService     ({ doctorId, search, page, perPage })
                                                      → Either<never,                        PatientPage>
UpdatePatientService    ({ doctorId, patientId, ...campos })
                                                      → Either<ResourceNotFoundError | BusinessRuleViolationError, Patient>
AnonymizePatientService ({ doctorId, patientId })     → Either<ResourceNotFoundError,        void>
FindPatientSummaryService ({ doctorId, patientId })   → Either<ResourceNotFoundError,        PatientSummary>
```

> `Either<never, T>` onde não há erro esperado: mantém a assinatura uniforme sem
> inventar um `Left` que ninguém produz. (Contraste com `RevokeSessionService` de
> 02.02, que devolve `void` puro por não ter **nada** a devolver.)

**O envelope de listagem** (PLAN §9.3), único para toda a API:

```jsonc
{ "data": [ /* PatientHttpResponse */ ],
  "meta": { "page": 1, "perPage": 20, "total": 42, "totalPages": 3 } }
```

**O presenter** — `anonymized` é derivado, não coluna:

```ts
PatientPresenter.toHttp(patient) → {
  id, name, phone, email, birthDate, sex, heightM, weightKg,
  anonymized: patient.isAnonymized(),
  createdAt: patient.createdAt.toISOString(),
}
```
<!-- /§contexto -->

---

<!-- §objetivo -->
## Objetivo

O médico passa a ter uma base de pacientes: cadastra, encontra pelo nome, corrige o
perfil e exerce o direito ao esquecimento sem destruir o histórico de atendimento.

É a primeira vez que o sistema guarda **dado clínico de terceiro** — e a primeira em
que INV-04 tem o que escopar. Até aqui o médico só lia a si mesmo; a partir daqui,
toda consulta ao banco que esquecer o `doctorId` expõe a base de outro consultório.

**Módulos impactados:** nasce o `PatientsModule`. Tocam `shared/constants/repositories.ts`,
`model-entities/`, `infrastructure/.../repositories/`, `presentation/presenters/`,
`gateways/http/` e o `HttpModule`.

**Risco principal:** IDOR. Um `findOne({ where: { id } })` sem `doctorId` passa em
todo teste feliz — quem o pega é um teste que cria dois médicos de propósito. É por
isso que o gate desta sprint exige o caso "recurso do outro médico → 404" em **toda**
rota com `:id`, não em uma.
**Risco número dois:** a anonimização. Apagar demais destrói histórico (INV-03);
apagar de menos é conformidade fingida — `review-security.md §verifica` trata
"marcar sem apagar" como ALTO.

**Agentes obrigatórios e por qual gatilho:** `[Database]` (migration e constraints) ·
`[Seguranca]` (PII, LGPD, escopo por médico) · `[Produto]` (6 rotas) · `[QA]` (fecha F3).

**Fora do escopo desta sprint:**

| Item | Vai para |
| --- | --- |
| `GET /api/patients/:id/appointments` (linha do tempo) | **04.02 (F5)** — depende de `appointments` existir |
| Qualquer coisa de agenda | 04.01 (F4) |
| Anonimizar o texto livre das anotações | **DEBT-01** — declarado, não implementado |
| Busca com acento-insensível ou por telefone/email | fora de escopo, se aparecer necessidade real |
| `Idempotency-Key` no `POST` | **DEBT-05** |
| Índice de texto (`pg_trgm`) para a busca | fora de escopo — decisão 12 explica por que não agora |
<!-- /§objetivo -->

---

<!-- §decisoes -->
## Decisões de execução

| # | Decisão | Escolha | Rationale | Alternativa descartada |
| --- | --- | --- | --- | --- |
| 1 | Assinatura da porta | **Todo** método recebe `doctorId`; o de leitura por id chama-se `findByIdForDoctor` | INV-04 deixa de depender de alguém lembrar: um método sem o parâmetro não compila, e o nome denuncia o que ele garante | `findById(id)` com o filtro aplicado "por convenção" no service |
| 2 | Recurso de outro médico | **404 `RESOURCE_NOT_FOUND`**, idêntico ao inexistente | 403 confirmaria que o recurso existe e vazaria a base alheia. A ausência é indistinguível da falta de permissão, de propósito | 403 `FORBIDDEN`, "mais informativo" |
| 3 | Onde o filtro por médico é aplicado | **No `where` da query**, dentro do adapter — nunca comparando `patient.doctorId` em JS depois de buscar | Comparar depois já leu a linha alheia: um `console.log` de debug ou um erro de mapeamento a expõe. E `list` com filtro em JS pagina errado | Buscar por id e conferir o dono no caso de uso |
| 4 | Colunas `numeric` | `transformer` obrigatório em `heightM` e `weightKg`, num arquivo compartilhado | Sem ele o TypeORM devolve `"1.68"` e o contrato publica string onde promete número — achado ALTO do `[Produto]` | Converter no presenter: conserta a saída e deixa o service comparando string com número |
| 5 | Tipo de `birthDate` no código | **`string \| null`** (`'YYYY-MM-DD'`), não `Date` | É o que a coluna `date` devolve e é o que o contrato publica. Tipar como `Date` faz o compilador afirmar algo falso, e o bug aparece no fuso de quem rodar | `Date` + transformer: reintroduz fuso num campo que não tem fuso |
| 6 | O que a anonimização apaga | `name` → rótulo fixo · `phone`, `email`, `birthDate` → `null` · carimba `anonymized_at` | `name` é `NOT NULL` no schema: não dá para anular. O rótulo mantém a linha legível numa listagem sem dizer quem era | Tornar `name` nulo: mudaria o DDL para acomodar um caso de exceção |
| 7 | O que a anonimização **preserva** | `sex`, `heightM`, `weightKg`, `created_at` e **todo** o histórico de agenda | INV-03. Sexo e medidas não identificam ninguém sozinhos, e são o que resta de valor clínico. Apagar agendamento é destruir trilha de atendimento — o oposto do que a LGPD pede aqui | Apagar tudo: "mais seguro" e ilegal do ponto de vista contábil |
| 8 | Onde mora a regra de anonimizar | **Na entity**: `Patient.anonymize(at)` e `isAnonymized()` | É regra sobre o próprio estado. No caso de uso, a entity vira saco de setters — modelo anêmico, achado MÉDIO do `[Dominio]` | Montar o objeto anonimizado no service |
| 9 | Anonimizar duas vezes | **204 nas duas.** `anonymize()` sai cedo se já anonimizado, preservando o carimbo original | `PRODUCT.md §regras`: excluir já anonimizado não é erro. E reescrever `anonymized_at` apagaria quando o direito foi exercido | 422 na segunda: transforma repetição de rede em erro do usuário |
| 10 | Editar paciente anonimizado | **422 `BUSINESS_RULE_VIOLATION`** (INV-02) | Anonimizado é registro contábil, não perfil ativo. Aceitar edição reintroduziria PII pela porta dos fundos | 404: mentiria dizendo que não existe |
| 11 | `PATCH` sem nenhum campo | **400 `VALIDATION_ERROR`** | Requisição sem efeito é payload malformado, não sucesso vazio. Um `.refine()` no schema cobra pelo menos um campo | 200 devolvendo o paciente intacto |
| 12 | Busca da listagem | `ILIKE '%termo%'` **só sobre `name`**, sem índice de texto | O consultório do desafio tem dezenas de pacientes: `pg_trgm` seria índice para uma carga que não existe. Buscar por email/telefone não está em requisito nenhum | `pg_trgm` + índice GIN agora; ou busca em 4 colunas "porque é fácil" |
| 13 | Paginação | `page` ≥ 1 (default 1) · `perPage` default 20, **máximo 100** | Sem teto, `?perPage=999999` é um SELECT da tabela inteira servido por um parâmetro de query | Sem limite; ou paginação por cursor (DEBT-09) |
| 14 | Envelope da listagem | `{ data, meta: { page, perPage, total, totalPages } }` — o de `PLAN.md §9.3` | Envelope único para toda a API. Array cru numa rota e objeto em outra é achado ALTO do `[Produto]` | Array cru com `X-Total-Count` no header |
| 15 | `anonymized` na resposta | **Derivado** de `anonymizedAt !== null`, no presenter | O cliente precisa saber que o perfil está inativo; a data em si é dado interno de conformidade | Publicar `anonymizedAt`: expõe quando sem necessidade |
| 16 | `FindPatientSummaryService` | Nasce **aqui**, exportado, devolvendo `{ id, name, isAnonymized }` | É a porta pública que `AppointmentsModule` vai injetar em F4 (`PRODUCT.md §dominios`). Nascer junto do módulo evita que F4 tenha a tentação de injetar `PATIENTS_REPOSITORY` | Criar em F4: a fronteira nasceria já sob pressão de prazo |
| 17 | O que `PatientsModule` exporta | Os 6 services. **Nunca** `PATIENTS_REPOSITORY` | A fronteira do agregado é o `exports` do módulo. Exportar o token daria a outro módulo o banco de `patients` por baixo da regra | Exportar o token "para facilitar F4" |
| 18 | Email do paciente | **Opcional**, validado quando presente; sem `UNIQUE` | `PRODUCT.md §regras`: o enunciado se contradiz e a decisão é aceitar. Unicidade seria invenção — dois pacientes podem compartilhar o email de um familiar | `UNIQUE (doctor_id, email)`: quebra cadastro legítimo |
| **19** | `ck_patients_birth_date` | **Acrescentado** ao DDL: `birth_date IS NULL OR birth_date <= CURRENT_DATE` | `review-database.md §regras` cobra `CHECK` para "data não futura" e o DDL de `PLAN.md §6.2` não o tinha — lacuna entre a fonte única de banco e o alvo. **Verificado contra o Postgres 16 desta stack**: a constraint é aceita, e é segura aqui porque data passada continua passada (linha válida na inserção nunca vira inválida depois). O Zod barra antes; o `CHECK` é a última linha | Deixar só no Zod: a regra existe e a aplicação é o único lugar que a conhece. `PLAN.md §6.2` é corrigido no fechamento |
| **20** | `save` também recebe `doctorId` | `save(patient, doctorId)`, e o `UPDATE` filtra por `(id, doctor_id)` | A decisão 1 diz "**todo** método recebe `doctorId`" e a porta contradizia a si mesma nos dois caminhos de escrita. Hoje a entity vem de `findByIdForDoctor` e já está escopada — mas isso é disciplina, e disciplina é o que INV-04 não pode depender | `save(patient)` confiando em quem chamou: funciona até o primeiro service que montar a entity à mão |
| **21** | Por que o service devolve a **entity** aqui, e `DoctorProfile` em 02.02 | `Patient` não tem campo secreto: toda coluna ou é publicável ou é descartada pelo presenter (`doctorId`, `anonymizedAt`) | A decisão 22 de 02.02 existe porque `Doctor` carrega `passwordHash` — o corte no caso de uso é a segunda barreira de INV-07. Sem campo sensível, um tipo espelho seria cerimônia. **A razão fica escrita para a próxima sprint não copiar o padrão errado** | Criar `PatientProfile` por simetria: duplica a entity inteira sem proteger nada |
| **22** | `totalPages` | Calculado no **`PaginatedPresenter`**, não no controller nem no service | É aritmética de apresentação: `total` e `perPage` já estão no domínio, `totalPages` só existe para o cliente. No controller, cada rota paginada futura reescreveria a mesma divisão | No service: infiltra formato de página no caso de uso |
| **23** | Textos das respostas de erro | 404 → **"Paciente não encontrado."** · 422 → **"Paciente anonimizado (LGPD) não pode receber novos agendamentos."** para agenda e **"Paciente anonimizado (LGPD) não pode ser editado."** para edição | Os dois primeiros são de `PRODUCT.md §regras`; o terceiro **não existe lá** — a tabela cobre agendar, não editar. Fixar aqui e acrescentar à `§regras` no fechamento, senão a doc fica incompleta e a mensagem nasce improvisada | Deixar o texto para a implementação: dois 404 com textos diferentes na mesma API |
| **24** | `%` e `_` no `?search=` | Passam como curinga do `LIKE`, sem escape | Buscar `100%` traz mais do que o esperado. Não é injeção (o parâmetro é vinculado), é ruído de busca numa base de dezenas de pacientes. **Declarado**, não tratado | Escapar os dois: código a mais para um caso que ninguém relatou |
<!-- /§decisoes -->

---

<!-- §nomes -->
## Nomes fixados

### Banco

| Tipo | Nome | Observação |
| --- | --- | --- |
| Tabela | `patients` | plural, `snake_case` |
| PK | `pk_patients` | via `primaryKeyConstraintName` |
| FK | `fk_patients_doctors` | **escrita na revisão da migration** — o gerador não a produz sem `@ManyToOne` (lição de 02.01) |
| Check | `ck_patients_sex` · `ck_patients_height` · `ck_patients_weight` · `ck_patients_birth_date` | `@Check(nome, expressão)` na entity — assinatura conferida no `typeorm@0.3.20` |
| Índice | `idx_patients_doctor` | `@Index` nomeado; serve a **toda** consulta desta sprint. **Motivo em comentário na migration**: performance |
| Migration | `<timestamp>-patients.ts` | gerada, revisada, forward-only |

### Código

| Tipo | Nome | Onde |
| --- | --- | --- |
| Token DI | `PATIENTS_REPOSITORY` | `shared/constants/repositories.ts` |
| Entity | `Patient` · enum `PatientSex` | `domains/domain/model-entities/` |
| Transformer | `numericTransformer` | `domains/domain/model-entities/numeric.transformer.ts` |
| Constante | `ANONYMIZED_PATIENT_NAME` = `'Paciente anonimizado'` | ao lado da entity |
| Porta | `PatientRepository` | `domains/domain/repositories/patient.repository.ts` |
| Adapter | `TypeOrmPatientRepository` | `infrastructure/.../repositories/` |
| Módulo | `PatientsModule` + `patientsProviders` | `domains/domain/services/patients/` |
| Service | `RegisterPatientService` · `ListPatientsService` · `GetPatientService` · `UpdatePatientService` · `AnonymizePatientService` · `FindPatientSummaryService` | `domains/domain/services/patients/` |
| Controller | `RegisterPatientController` · `ListPatientsController` · `GetPatientController` · `UpdatePatientController` · `AnonymizePatientController` | `gateways/http/controllers/domain/patients/` |
| DTO | `RegisterPatientDto` · `UpdatePatientDto` · `ListPatientsQueryDto` | `gateways/http/schemas/domain/patient.schema.ts` |
| Presenter | `PatientPresenter` · `PaginatedPresenter` | `presentation/presenters/` |
<!-- /§nomes -->

---

<!-- §escopo -->
## Escopo — plano ordenado

| # | Ação | Arquivo | Tipo | Depende de |
| --- | --- | --- | --- | --- |
| 1 | Editar | `src/shared/constants/repositories.ts` — `PATIENTS_REPOSITORY` | ALTER | — |
| 2 | Criar | `model-entities/numeric.transformer.ts` (decisão 4) | NOVO | — |
| 3 | Criar | `model-entities/patient.entity.ts` — **código no §contexto** | NOVO | 2 |
| 4 | Editar | `model-entities/index.ts` — `Patient` **depois** de `Doctor` (FK) | ALTER | 3 |
| 5 | Gerar | `npm run migration:generate --name=patients` | NOVO | 4 |
| 6 | **Revisar** | a migration contra o DDL do §contexto; **acrescentar a FK à mão** no `up()` e no `down()` | ALTER | 5 |
| 7 | Verificar | `migration:run` nos dois bancos; conferir com `\d patients` os 5 nomes de constraint e os 3 `CHECK` | — | 6 |
| 8 | Criar | `repositories/patient.repository.ts` — porta do §contexto | NOVO | 3 |
| 9 | Criar | `infrastructure/.../repositories/typeorm-patient.repository.ts` — **todo `where` com `doctorId`** | NOVO | 8 |
| 10 | Criar | `services/patients/register-patient.service.ts` | NOVO | 8 |
| 11 | Criar | `services/patients/get-patient.service.ts` | NOVO | 8 |
| 12 | Criar | `services/patients/list-patients.service.ts` | NOVO | 8 |
| 13 | Criar | `services/patients/update-patient.service.ts` — INV-02 (decisão 10) | NOVO | 8 |
| 14 | Criar | `services/patients/anonymize-patient.service.ts` — chama `patient.anonymize()` | NOVO | 3, 8 |
| 15 | Criar | `services/patients/find-patient-summary.service.ts` (decisão 16) | NOVO | 8 |
| 16 | Criar | `services/patients/patients.provider.ts` + `patients.module.ts` (decisão 17) | NOVO | 9–15 |
| 17 | Criar | `gateways/http/schemas/domain/patient.schema.ts` — 3 DTOs, `.strict()` | NOVO | — |
| 18 | Criar | `presentation/presenters/patient.presenter.ts` + `paginated.presenter.ts` | NOVO | 3 |
| 19 | Criar | os 5 controllers em `controllers/domain/patients/` + `index.ts` | NOVO | 10–18 |
| 20 | Editar | `gateways/http/http.module.ts` — importa `PatientsModule`, registra os 5 controllers | ALTER | 16, 19 |
| 21 | Criar | 6 `*.spec.ts` ao lado dos services | NOVO | 10–15 |
| 22 | Criar | `test/integration/patients.e2e-spec.ts` — CRUD, validação, INV-02/03/04 | NOVO | 20 |
| 23 | Verificar | **404 cross-doctor em todas as 4 rotas com `:id`** — dois médicos criados no e2e | — | 22 |
| 24 | Editar | `seeds/demo.seed.ts` — nada aqui; o seed de pacientes é 05.01 (F6) | — | — |

### Migrations

**Uma:** `<timestamp>-patients.ts`. A FK `fk_patients_doctors` entra na revisão, à
mão, no `up()` **e** no `down()` — o gerador não a produz porque não há `@ManyToOne`
(ADR-04). Os três `CHECK` e o índice saem do decorator; **conferir no SQL**.

**Commits sugeridos:** `feat: tabela de pacientes` · `feat: cadastro e consulta de paciente` ·
`feat: listagem com busca por nome e paginacao` · `feat: edicao de perfil do paciente` ·
`feat: anonimizacao lgpd preservando historico` · `test: integracao de pacientes`
<!-- /§escopo -->

---

<!-- §edge-cases -->
## Edge cases

| # | Caso | Comportamento esperado | Coberto por |
| --- | --- | --- | --- |
| 1 | `GET /patients/:id` de paciente **de outro médico** | **404**, idêntico ao inexistente | INV-04, decisão 2 + e2e |
| 2 | `PATCH` em paciente de outro médico | 404 — e a linha alheia **não muda** | INV-04 + e2e |
| 3 | `DELETE` em paciente de outro médico | 404 — e a linha alheia **não é anonimizada** | INV-04 + e2e |
| 4 | `GET /patients` com dois médicos na base | Cada um vê só os seus; `meta.total` conta só os seus | INV-04 + e2e |
| 5 | `PATCH` em paciente anonimizado | **422** `BUSINESS_RULE_VIOLATION` | INV-02, decisão 10 |
| 6 | `DELETE` em paciente já anonimizado | **204**, e `anonymized_at` **não muda** | decisão 9 + e2e |
| 7 | Anonimizar preserva o histórico | Contagem de agendamentos antes e depois é igual | INV-03 — **só exercitável em F4**; aqui vale a asserção de que o service não toca outra tabela |
| 8 | `heightM` na resposta | `1.68` **número**, não `"1.68"` | decisão 4 + e2e |
| 9 | `birthDate` na resposta | `"1987-01-01"`, sem hora e sem deslocamento de fuso | decisão 5 + e2e |
| 10 | Altura fora da faixa (`0.2`, `3.0`) | **400** pelo Zod, e o `CHECK` do banco como última linha | e2e |
| 11 | Peso negativo ou zero | 400 | e2e |
| 12 | Nascimento no futuro | 400 | e2e |
| 13 | `sex` fora do enum | 400 | e2e |
| 14 | Campo desconhecido no corpo | 400 — `.strict()` | e2e |
| 15 | `PATCH` com corpo `{}` | **400**, não 200 | decisão 11 |
| 16 | Cadastro só com `name` | **201** — todo o resto é opcional | decisão 18 + e2e |
| 17 | Dois pacientes com o mesmo email | **201** nos dois: não há `UNIQUE` | decisão 18 |
| 18 | `?search=ana` com acento na base (`Ana`, `Aná`) | Encontra `Ana`; **não** encontra `Aná`. Limite conhecido e declarado | decisão 12 |
| 19 | `?perPage=999999` | Teto de 100 aplicado, sem erro | decisão 13 |
| 20 | `?page=0` ou `?page=-1` | 400 | e2e |
| 21 | Listagem vazia | `{ data: [], meta: { total: 0, totalPages: 0 } }` — 200, não 404 | e2e |
| 22 | Qualquer rota desta sprint **sem token** | 401 — nenhuma leva `@Public()`, e `public-routes.e2e-spec.ts` reprova se alguma levar | 02.02 + e2e |

> INV-01 e INV-05 não entram: não há agenda nem anotação. INV-06 e INV-07 seguem
> valendo — nenhuma resposta desta sprint carrega hash de coisa alguma.
<!-- /§edge-cases -->

---

<!-- §checklist -->
## Checklist anti-erro (pré-fechamento)

**Verde**
- [x] `lint` + `typecheck` + `build` + `test` + `test:e2e` — todos verdes
- [x] Fluxo à mão no `/api/docs`: login → Authorize → cadastrar → listar com busca → editar → anonimizar → listar de novo

**Banco** (veto `[Database]`)
- [x] SQL gerado **revisado linha a linha** contra o DDL do §contexto
- [x] `pk_patients` · `fk_patients_doctors` · `ck_patients_sex` · `ck_patients_height` · `ck_patients_weight` · `ck_patients_birth_date` · `idx_patients_doctor` — nomes exatos, conferidos com `\d patients`
- [x] Nenhum nome inventado pelo gerador (`UQ_…`, `CHK_…`, `FK_…`)
- [x] Os **quatro** `CHECK` saíram no SQL com a expressão do §contexto
- [x] `CREATE INDEX` com o **motivo declarado em comentário** na migration (regra de `review-database.md §regras`/Índices)
- [x] `height_m` é `numeric(3,2)` e `weight_kg` é `numeric(5,2)`; `birth_date` é `date`, não `timestamptz`
- [x] A FK foi acrescentada à mão e o `down()` a desfaz
- [x] `down()` testado com `migration:revert` → `migration:run`
- [x] Migration aplicada nos **dois** bancos

**Segurança** (veto `[Seguranca]`)
- [x] **INV-04:** todo método do adapter tem `doctorId` no `where` — conferido método a método
- [x] **INV-04:** `doctorId` vem **só** de `@CurrentDoctor()`; nenhum controller o aceita do corpo, da query ou da rota
- [x] 404 (não 403) para recurso de outro médico, em **todas** as 4 rotas com `:id`
- [x] A anonimização **apaga** de fato: `phone`, `email`, `birth_date` nulos no banco e `name` no rótulo — verificado por consulta, não pela resposta
- [x] Nenhum log com nome, telefone, email ou nascimento — só ID
- [x] `details[]` de validação não ecoa o valor recebido (só `path` e mensagem)
- [x] DEBT-01 (texto livre da anotação) continua declarado, não silenciosamente resolvido

**Domínio e arquitetura**
- [x] `Patient.anonymize()` e `isAnonymized()` moram na **entity** (decisão 8)
- [x] Os services não importam `typeorm` — lint verde
- [x] Cada service tem um `execute` e devolve `Either`
- [x] Nenhuma transação: cada operação toca uma linha de um agregado
- [x] `PatientsModule` exporta os services, **nunca** `PATIENTS_REPOSITORY`
- [x] `Patient` referencia o médico por `doctorId`, sem `@ManyToOne`

**Contrato** (`[Produto]`)
- [x] `POST` 201 · `GET` lista 200 com `{ data, meta }` · `GET` :id 200 · `PATCH` 200 · `DELETE` **204**
- [x] `heightM`/`weightKg` são **números** no JSON; `birthDate` é `'YYYY-MM-DD'`
- [x] As 5 rotas em `/api/docs` com `@ApiTags('pacientes')`, `@ApiBearerAuth()`, `@ApiOperation` e exemplo de sucesso e dos erros interessantes (404, 422)
- [x] Textos exatamente como na decisão 23 — e `PRODUCT.md §regras` ganha a linha de "editar paciente anonimizado", que hoje não tem

**Testes** (`[QA]`, fecha F3)
- [x] 404 cross-doctor testado nas 4 rotas com `:id` — **dois médicos** criados no e2e
- [x] Anonimização verificada **no banco**, não só pela resposta
- [x] Anonimizar duas vezes: 204 nas duas e `anonymized_at` inalterado
- [x] Um teste por regra de validação (altura, peso, nascimento, sexo, campo extra, `PATCH` vazio)
- [x] Nenhum registro compartilhado entre casos

**Plano**
- [x] `PLAN.md §6.2` corrigido com `ck_patients_birth_date` (decisão 19)
- [x] `PRODUCT.md §regras` ganha a linha de edição de paciente anonimizado (decisão 23)
- [x] `PRODUCT.md §banco` confirma `patients` como aplicada
- [x] `PRODUCT.md §roadmap`: linha 03.01 → ✅
- [x] Débito novo, se houver, no ledger com gatilho de reabertura
<!-- /§checklist -->

---

<!-- §scores -->
## Scores de fricção

### Fricção PRÉ — 2026-08-09

| Agente | Fase | Score | Severidade máxima | Observação |
| --- | --- | --- | --- | --- |
| `[Database]` | PRÉ | **8/10 → 9/10** | MÉDIO (1) | MÉDIO: `review-database.md §regras` cobra `CHECK` para "data não futura" e o DDL de `PLAN.md §6.2` não o tem — lacuna entre a fonte única de banco e o alvo, herdada sem ninguém notar. Resolvido pela decisão 19. Passou: `numeric` com transformer nas duas colunas, `date` puro em `birth_date`, `varchar`+`CHECK` em vez de enum nativo, FK à mão na revisão (lição de 02.01), nomes no padrão. BAIXO (resolvido): o checklist não cobrava o **motivo do índice em comentário na migration**, que foi exatamente o achado BAIXO da PÓS de 02.01 |
| `[Seguranca]` | PRÉ | **7/10 → 9/10** | ALTO (1) | REJECTED na 1ª passada: a porta **contradizia a própria decisão 1** — `save(patient)` era o único método sem `doctorId`, e é um dos dois caminhos de **escrita**. Hoje a entity vem de `findByIdForDoctor` e já está escopada, mas isso é disciplina, e INV-04 não pode depender de disciplina. Resolvido pela decisão 20: `save(patient, doctorId)` com `(id, doctor_id)` no `where` do `UPDATE`. BAIXO (declarado): `%` e `_` no `?search=` passam como curinga (decisão 24) |
| `[Dominio]` | PRÉ | **8/10 → 9/10** | MÉDIO (1) | MÉDIO: o doc mandava o service devolver a entity `Patient`, enquanto 02.02 (decisão 22) mandava devolver um tipo espelho. Duas sprints seguidas com regras opostas e **nenhuma razão escrita** é como um padrão se corrompe. Resolvido pela decisão 21, que fixa o critério: tipo espelho existe quando a entity carrega campo secreto. Passou: regra de anonimizar na **entity** (sem modelo anêmico), referência por ID, uma escrita por transação, `Either` no retorno |
| `[Backend]` | PRÉ | **9/10** | MÉDIO (1) | MÉDIO: `totalPages` não tinha dono — no controller, toda rota paginada futura reescreveria a mesma divisão. Resolvido pela decisão 22 (`PaginatedPresenter`). Passou: `PatientsModule` exportando services e nunca o token (decisão 17), `FindPatientSummaryService` nascendo junto para F4 não ter a tentação de furar a fronteira, adapter sem regra de negócio |
| `[Produto]` | PRÉ | **8/10 → 9/10** | MÉDIO (1) | MÉDIO: os textos das respostas de erro não estavam fixados, e a mensagem de **editar** paciente anonimizado **não existe** em `PRODUCT.md §regras` — a tabela cobre agendar. Improvisar na implementação daria dois textos para a mesma família de erro. Resolvido pela decisão 23, com a correção da `§regras` no fechamento. BAIXO (resolvido): `@ApiTags` sem valor declarado |
| `[QA]` | PRÉ | **9/10** | BAIXO (1) | O gate mais forte da sprint é o 404 cross-doctor nas **4** rotas com `:id`, com dois médicos criados de propósito — é o único formato em que um `where` sem `doctorId` fica vermelho. Anonimização verificada por consulta ao banco, não pela resposta. BAIXO: INV-03 (preservar histórico) só é exercitável em F4; o edge case 7 já declara isso em vez de fingir cobertura |

**Conflitos entre agentes:** nenhum.

**Verificado antes de decidir, não inferido:**

```
psql prontomed_test → CREATE TABLE _t (b date, CHECK (b IS NULL OR b <= CURRENT_DATE))
  → ACEITO pelo Postgres 16.  A hipótese que eu ia escrever ("CHECK com CURRENT_DATE
    é recusado por não ser IMMUTABLE") estava ERRADA, e a verificação inverteu o
    achado: em vez de "impossível", é uma constraint que faltava.
    Seguro aqui porque data passada continua passada — linha válida na inserção
    nunca vira inválida depois.

typeorm@0.3.20/decorator/Check.d.ts → Check(name, expression) existe
  → o `@Check('ck_patients_...', '...')` do §contexto compila
```

### Fricção PÓS — 2026-08-09

| Agente | Fase | Score | Severidade máxima | Observação |
| --- | --- | --- | --- | --- |
| `[Database]` | PÓS | **9/10** | ALTO (1, evitado) | A revisão da migration pegou o achado da sprint: o gerador abria o `up()` derrubando `fk_refresh_tokens_doctors` (issue 1). Schema conferido com `\d patients`: os 4 `CHECK`, `numeric(3,2)`/`numeric(5,2)`, `birth_date` como `date`, `pk_`, `idx_`, `fk_` com os nomes exatos, e `pg_constraint` mostrando as **duas** FKs vivas. Índice com motivo em comentário. O `-1` é da fricção PRÉ, que não previu o `DROP CONSTRAINT` — o achado veio do olho na revisão, não do plano |
| `[Seguranca]` | PÓS | **9/10** | — | INV-04 provado **duas vezes**: no e2e com dois médicos e no `curl` contra a API no ar — `GET`/`PATCH`/`DELETE` do paciente alheio → 404, linha intacta no banco, listagem com `total: 1`. Anonimização verificada por `SELECT`, não pela resposta: nome no rótulo, telefone/email/nascimento nulos, sexo e medidas preservados. `save` com `(id, doctor_id)` no `where`. Nenhum log com PII |
| `[Dominio]` | PÓS | **9/10** | — | `anonymize()` na entity, com a idempotência **medida** (carimbo idêntico antes e depois da segunda chamada, no banco). INV-02 recusando com 422 e não 404. Nenhuma transação, uma escrita por operação, `Either` só onde há erro esperado |
| `[Backend]` | PÓS | **9/10** | MÉDIO (1) | Camadas limpas com lint verde; `PatientsModule` exporta services e nunca o token; `FindPatientSummaryService` nasceu com spec, sem consumidor. MÉDIO: o `Either<never, T>` do plano caiu na implementação (issue 2) — a assinatura uniforme obrigaria dois controllers a um ramo morto |
| `[Produto]` | PÓS | **8/10 → 9/10** | **ALTO (1)** | ALTO: campo desconhecido devolvia `"Unrecognized key(s) in object: 'doctorId'"` — inglês e jargão de lib, contra ADR-13 —, **e o defeito existia desde 02.01**. Corrigido nos dois schemas e registrado em `PRODUCT.md §regras`. Fora isso: 201/200/204 conforme `§9.1`, envelope `{data, meta}`, `heightM` número e `birthDate` sem fuso conferidos na resposta real |
| `[QA]` | PÓS | **9/10** | MÉDIO (1) | 73 unitários + 79 e2e verdes. O gate da sprint — 404 cross-doctor nas rotas com `:id`, com dois médicos — está no e2e, com asserção de que a **linha alheia não mudou**. MÉDIO: o `TRUNCATE` escrito à mão quebrou a suíte de autenticação inteira quando `patients` nasceu (issue 4); virou `truncateAll`, com a lista num lugar só |

**Conflitos entre agentes:** nenhum.

**Gates no fechamento** (em `docker exec api-prontomed`):

```
typecheck  ✅   lint  ✅   build  ✅
test       ✅   14 suítes, 73 casos
test:e2e   ✅    7 suítes, 79 casos
migration  ✅   aplicada nos dois bancos; \d patients confere 4 CHECK + pk + idx + fk
                pg_constraint: fk_patients_doctors E fk_refresh_tokens_doctors vivas

curl (API no ar, banco de dev):
  POST   201 · heightM 1.68 número · birthDate '1987-01-01' sem fuso
  GET    200 · {data, meta:{page,perPage,total,totalPages}} · busca por nome
  GET/:id 200 · inexistente 404 · id malformado 400
  PATCH  200 (só o campo enviado) · corpo vazio 400
  DELETE 204 · repetido 204 com carimbo preservado (medido: 20:43:02.118+00 nos dois)
  INV-04 404 no GET, PATCH e DELETE do paciente alheio; linha do outro médico intacta
  validação 400 em altura, peso, nascimento futuro, sexo, campo extra, sem nome, perPage
```

**Dados de teste removidos do banco de dev** ao fim: sobrou só o médico do seed.
<!-- /§scores -->

---

<!-- §issues -->
## Issues encontrados durante a implementação

| # | Descoberta | Causa raiz | Solução | Arquivos | Virou |
| --- | --- | --- | --- | --- | --- |
| **1** | **A migration gerada começava derrubando a FK de 02.01.** Primeira linha do `up()`: `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "fk_refresh_tokens_doctors"` | O gerador compara schema real × entities. `fk_refresh_tokens_doctors` existe no banco mas não em decorator nenhum — agregados se referenciam por ID (ADR-04) e ela entrou à mão. Para o gerador, é sobra. O `down()` vinha com o `ADD CONSTRAINT` correspondente, o que faz o par **parecer** coerente | Linha removida do `up()` e do `down()`. Confirmado depois da aplicação: `select conname from pg_constraint where conname like 'fk_%'` devolve as **duas** FKs | `1786305535591-sprint03.01-patients.ts` | **Armadilha permanente em `PLAN.md §16.4`.** Vale para toda migration futura e piora a cada FK nova: com 4 FKs, a próxima migration virá com 4 `DROP CONSTRAINT`. É o achado que paga a regra "migration gerada é sempre revisada" — comitada sem revisão, ela destrói integridade referencial em silêncio |
| **2** | `Either<never, T>` caiu | O §contexto mandava assinatura uniforme nos 6 services, mas `RegisterPatient` e `ListPatients` não têm erro esperado: o `Left` seria `never` e **todo controller carregaria um ramo morto** | Devolvem o valor direto, como o `RevokeSessionService` de 02.02 | `register-patient.service.ts`, `list-patients.service.ts` | Critério consolidado: `Either` existe onde há erro a tratar — nem por simetria, nem por hábito |
| **3** | `ParseUUIDPipe` não estava no plano | Sem ele, `:id` malformado chega ao Postgres e volta como **500** do driver, em vez de 400 na borda | Pipe nas 3 rotas com `:id` | os 3 controllers com `:id` | Vale para toda rota com `:id` de F4 e F5 |
| **4** | O `TRUNCATE TABLE refresh_tokens, doctors` da suíte de **autenticação** quebrou inteiro ao nascer `patients` — `cannot truncate a table referenced in a foreign key constraint` | A lista de tabelas estava escrita à mão em cada `*.e2e-spec.ts`. Tabela nova referencia `doctors`, e a instrução que não a menciona passa a ser recusada | `test/factories/truncate-all.ts`: a lista vive num lugar só. Sem `CASCADE`, que apagaria o que a lista não menciona | `truncate-all.ts`, `authentication.e2e-spec.ts` | Cada tabela futura custa **uma** edição, em vez de uma caçada por arquivo. `appointments` e `consultation_notes` já sabem para onde ir |
| **5** | **`.strict()` do Zod devolvia mensagem em inglês** ao cliente: `"Unrecognized key(s) in object: 'doctorId'"` — jargão de lib numa API que promete PT-BR (ADR-13). **E o defeito existia desde 02.01**, no login | `.strict()` sem argumento usa a mensagem padrão da lib. O e2e de 02.01 afirmava "400 com `details[]`" e **nunca olhou o texto** — teste verde sobre mensagem errada | `.strict('Campo desconhecido no corpo da requisição.')` nos schemas de paciente **e** de autenticação; a linha entrou em `PRODUCT.md §regras` | `patient.schema.ts`, `authentication.schema.ts` | Achado do **teste empírico**, não da suíte: e2e prova o que a asserção afirma; `curl` mostra o que o cliente recebe. Regra nova: asserção sobre erro inclui o **texto**, não só o `code` |

> Preencher **durante** a sprint, não no fechamento.
<!-- /§issues -->
