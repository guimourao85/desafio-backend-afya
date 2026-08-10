# PRODUCT.md — ProntoMed

> Sumário:
>
> - §contexto — o que o produto é, para quem, e o que ele deliberadamente não é
> - §personas — a única persona (médico) e o consumidor da API (avaliador)
> - §jornadas — 4 jornadas derivadas dos wireframes, com o que cada uma exige do backend
> - §dominios — os 4 agregados, a fronteira entre módulos e a regra de referência por identidade
> - §invariantes — as 7 leis do sistema (nunca violar), com enforcement e resposta HTTP
> - §regras — decisões de comportamento externo: o que o cliente da API vê em cada situação
> - §banco — inventário de tabelas, PKs, relacionamentos e decisões de modelagem
> - §adrs — 13 decisões arquiteturais com alternativa rejeitada e preço
> - §roadmap — estado atual por sprint × fase, com o de-para canônico (não história)
>
> **Autoridade:** este documento manda em produto, domínio, invariantes e ADRs.
> Execução (fases, contratos HTTP, padrões de código) → [PLAN.md](PLAN.md).
> Débitos → [DEBITOS-TECNICOS.md](DEBITOS-TECNICOS.md).

---

<!-- §contexto -->

## Contexto

**ProntoMed** é o backend de um prontuário eletrônico de consultório: o médico
cadastra seus pacientes, agenda as consultas e registra as anotações de cada
atendimento.

O que a aplicação faz:

- Cadastro e manutenção do perfil clínico-administrativo do paciente
- Agenda do médico, com garantia de que dois pacientes não ocupam o mesmo horário
- Registro e leitura das anotações de cada consulta
- Autenticação do médico com sessão renovável
- Direito ao esquecimento (LGPD) sem perder o histórico contábil de atendimentos

O que a aplicação **não** é:

- Não é multi-clínica: cada médico enxerga apenas os próprios pacientes e a própria agenda
- Não é sistema de prescrição, faturamento, convênio ou telemedicina
- Não tem frontend — os wireframes do desafio são fonte de domínio, não de entrega
- Não roda em produção: é POC avaliada localmente (ADR-12)

**Origem:** desafio técnico "Desafio Backend" (Afya). Rastreabilidade
requisito → fase em [PLAN.md §1](PLAN.md).

<!-- /§contexto -->

---

<!-- §personas -->

## Personas

| Persona                                   | Quem é                                                                            | O que precisa                                                                                                               | O que nunca pode                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Médico** (única persona do sistema)     | Profissional que atende no consultório. Autentica-se e opera sobre a própria base | Cadastrar e editar pacientes, agendar e reagendar consultas, anotar atendimentos, consultar a linha do tempo de um paciente | Ver ou alterar paciente, agenda ou anotação de outro médico (INV-04) |
| **Avaliador da API** (persona de consumo) | Quem exercita a API pelo Swagger para julgar o trabalho                           | Subir o projeto em três comandos, logar, autorizar no Swagger e percorrer todos os requisitos em minutos                    | Precisar ler o código para descobrir como usar a API                 |

> Há **um único papel**. RBAC com papéis múltiplos seria abstração antecipada —
> registrado como DEBT-08, com o ponto de extensão nomeado.

<!-- /§personas -->

---

<!-- §jornadas -->

## Jornadas

Derivadas dos 6 wireframes do desafio. Cada uma diz o que o backend precisa
entregar — não como.

### J1 — Manter a base de pacientes

O médico lista seus pacientes (nome, nascimento, sexo, telefone), busca por nome,
abre o detalhe de um deles, edita o cadastro.
**Exige:** listagem paginada e pesquisável, detalhe, edição parcial, escopo por médico.

### J2 — Operar a agenda

O médico vê os agendamentos (paciente e data), cria um novo escolhendo paciente e
data/hora, abre o detalhe para reagendar ou excluir.
**Exige:** CRUD de agendamento, filtro por período e paciente, **recusa determinística de horário ocupado** e cancelamento que preserva a trilha.

### J3 — Registrar o atendimento

Durante ou após a consulta, o médico escolhe **qual consulta** está anotando (o
wireframe mostra um dropdown com as datas existentes) e grava a observação.
**Exige:** anotação sempre pendurada em uma consulta existente e viva.

### J4 — Ler o histórico do paciente

Na tela do paciente, o médico vê a tabela "Data da consulta × Atendimento".
**Exige:** linha do tempo do paciente com consultas e suas anotações, em uma única chamada.

### J5 — Esquecer o paciente (LGPD)

O paciente pede exclusão dos dados pessoais. O médico executa, e a contabilidade
dos atendimentos permanece.
**Exige:** anonimização que apaga a identificação e mantém consultas e anotações intactas.

<!-- /§jornadas -->

---

<!-- §dominios -->

## Domínios

### Agregados

Agregado é a unidade de consistência: o que muda junto, e o que uma transação pode
tocar de uma vez.

| Agregado           | Raiz           | Contém               | Porta                    | Módulo Nest            |
| ------------------ | -------------- | -------------------- | ------------------------ | ---------------------- |
| **Doctor**         | `Doctor`       | —                    | `DoctorRepository`       | `AuthenticationModule` |
| **RefreshSession** | `RefreshToken` | —                    | `RefreshTokenRepository` | `AuthenticationModule` |
| **Patient**        | `Patient`      | —                    | `PatientRepository`      | `PatientsModule`       |
| **Appointment**    | `Appointment`  | `ConsultationNote[]` | `AppointmentRepository`  | `AppointmentsModule`   |

**A anotação não é agregado.** Ela não existe fora de uma consulta (J3): é entidade
interna de `Appointment`, criada por `Appointment.addNote()` e persistida junto com
a raiz. Por isso **não há** `ConsultationNoteRepository` — um repositório por raiz,
quatro no total.

### Duas regras que definem a fronteira

1. **Agregados se referenciam por identidade.** `Appointment.patientId: string`, nunca `Appointment.patient: Patient`. O modelo não oferece o caminho do join entre agregados, então ele não nasce por descuido.
2. **Uma transação toca um agregado.** Quando uma operação exige mais de uma linha (salvar a consulta com suas anotações), a **porta declara a operação atômica** e a transação vive dentro do adapter — nunca no caso de uso.

> **FK física ≠ referência de domínio.** A FK continua no banco: num banco único
> ela garante integridade de graça. Referência por ID é decisão de _domínio_; FK é
> decisão de _persistência_. As duas coexistem sem contradição.

### Módulos e travessias

Em NestJS a fronteira é o **módulo**: o que não está em `exports` não é injetável fora dele.

| Módulo Nest            | Responsabilidade                | Exporta                                                        |
| ---------------------- | ------------------------------- | -------------------------------------------------------------- |
| `AuthenticationModule` | médico, login, sessão renovável | services de auth + provider                                    |
| `PatientsModule`       | cadastro, perfil, anonimização  | services de paciente + `FindPatientSummaryService` (o público) |
| `AppointmentsModule`   | agenda e anotações              | services de agenda; **importa** `PatientsModule`               |

- `AppointmentsModule` **pergunta** a `PatientsModule` se o paciente existe e está ativo, injetando `FindPatientSummaryService`. Ele **nunca** injeta `PATIENTS_REPOSITORY` nem faz join com `patients`.
- **Travessias de FK catalogadas — são exatamente duas:** `appointments.patient_id → patients` e `*.doctor_id → doctors`. Saber onde estão é o que torna qualquer separação futura um trabalho conhecido.
<!-- /§dominios -->

---

<!-- §invariantes -->

## Invariantes

As 7 leis do sistema. Nunca violar. Cada uma tem enforcement declarado e um teste
nomeado ([PLAN.md §12.4](PLAN.md)).

> **O que "testado" quer dizer aqui.** Teste nomeado prova que a regra **existe** e
> que ela rejeita o caso que deve rejeitar. Ele **não** prova comportamento sob
> corrida, volume ou retry — essa classe de prova é da sprint 06.01, por regra de
> escopo declarada em [PLAN.md §3.2](PLAN.md). Vale para todas as sete.
>
> **A exceção é a INV-01, e ela fechou em 10/08/2026.** O índice único parcial é a
> única defesa real contra duas requisições simultâneas, e agora está **exercitado
> sob corrida**: 20 requisições no mesmo slot produzem `1× 201` e `19× 409`, e com o
> índice removido do banco as mesmas 20 criam **12** consultas. A prova vive em
> `npm run test:stress` — comando manual, **demonstração e não regressão**: nada a
> dispara sozinha, e `npm run test:e2e` verde continua não sendo prova de
> concorrência.

| ID         | Invariante                                                                                     | Enforcement                                                                   | HTTP    |
| ---------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------- |
| **INV-01** | Um médico não tem dois agendamentos **não cancelados** no mesmo instante                       | caso de uso consulta **+** índice único parcial `uk_appointments_doctor_slot` | 409     |
| **INV-02** | Paciente anonimizado não aceita edição, novo agendamento nem reagendamento                     | `Patient.isAnonymized()` verificado no caso de uso                            | 422     |
| **INV-03** | Anonimizar **preserva** todos os agendamentos e anotações do paciente                          | o caso de uso só toca colunas de PII; teste conta registros antes e depois    | —       |
| **INV-04** | Todo dado lido ou escrito é escopado pelo `doctorId` do token; recurso alheio responde **404** | todo método de repositório recebe `doctorId`; nenhuma leitura sem esse filtro | 404     |
| **INV-05** | Anotação só existe dentro de um agendamento existente e não cancelado                          | entidade interna do agregado + validação de status em `addNote()`             | 404/422 |
| **INV-06** | Refresh token é persistido só como SHA-256; o valor em claro só existe na resposta HTTP        | hash antes de gravar; nenhuma coluna guarda o token cru                       | —       |
| **INV-07** | Nenhuma resposta contém `password_hash` ou `token_hash`                                        | presenters são a única via de serialização                                    | —       |

**Por que 404 e não 403 em INV-04:** responder 403 confirmaria que o recurso
existe e vazaria a base de outro médico. A ausência é indistinguível da falta de
permissão — de propósito.

<!-- /§invariantes -->

---

<!-- §regras -->

## Regras de comportamento externo

O que o cliente da API vê. `[Dominio]` decide se pode; aqui está o que se responde
quando não pode.

| Situação                                     | Resposta                      | Mensagem (PT-BR)                                                   |
| -------------------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| Horário já ocupado na agenda do médico       | 409 `SCHEDULE_CONFLICT`       | "Já existe um agendamento neste horário."                          |
| Agendar paciente anonimizado                 | 422 `BUSINESS_RULE_VIOLATION` | "Paciente anonimizado (LGPD) não pode receber novos agendamentos." |
| **Editar** paciente anonimizado              | 422 `BUSINESS_RULE_VIOLATION` | "Paciente anonimizado (LGPD) não pode ser editado."                |
| **Reagendar** consulta de paciente anonimizado | 422 `BUSINESS_RULE_VIOLATION` | "Paciente anonimizado (LGPD) não pode ter consultas reagendadas."  |
| Campo desconhecido no corpo                  | 400 `VALIDATION_ERROR`        | "Requisição inválida." + `details: [{ path: "", message: "Campo desconhecido no corpo da requisição." }]` |
| Anotar em consulta cancelada                 | 422 `BUSINESS_RULE_VIOLATION` | "Consulta cancelada não aceita anotações."                         |
| Reagendar consulta cancelada ou concluída    | 422 `BUSINESS_RULE_VIOLATION` | "Consulta cancelada ou concluída não pode ser reagendada."          |
| Concluir consulta não agendada               | 422 `BUSINESS_RULE_VIOLATION` | "Só uma consulta agendada pode ser concluída."                      |
| Cancelar consulta já concluída               | 422 `BUSINESS_RULE_VIOLATION` | "Consulta já concluída não pode ser cancelada."                     |
| Recurso de outro médico, ou inexistente      | 404 `RESOURCE_NOT_FOUND`      | "Paciente não encontrado." / "Agendamento não encontrado."         |
| Campo com formato inválido, no corpo ou na query | 400 `VALIDATION_ERROR`    | "Requisição inválida." + `details[]` por campo                     |
| **`:id` de caminho fora do formato UUID**    | 400 `VALIDATION_ERROR`        | "Requisição inválida." — **sem `details`**: o pipe global valida `@Param` também, e aí não há campo de formulário a apontar |
| Refresh inexistente, expirado, revogado ou que nunca foi um refresh | 401 `INVALID_REFRESH_TOKEN`   | "Refresh token inválido ou sessão expirada. Faça login novamente." — uma mensagem só, sem afirmar causa: distinguir seria oráculo |
| Excluir paciente já anonimizado              | 204                           | — (idempotente: não é erro)                                        |
| Cancelar agendamento já cancelado            | 204                           | — (idempotente)                                                    |
| Logout com token desconhecido                | 204                           | — (logout nunca falha)                                             |

**Decisões de produto embutidas nos requisitos:**

- **"Excluir agendamento" significa cancelar.** O verbo HTTP continua `DELETE`, o efeito é `status = CANCELLED`. Exclusão física destruiria a trilha e colidiria com o direito ao esquecimento (que exige _preservar_ o histórico de atendimento).
- **"Excluir paciente" significa anonimizar.** Apaga nome, telefone, email e nascimento; mantém a linha e todo o histórico. O paciente anonimizado vira um registro contábil sem identidade.
- **Email é opcional.** O enunciado do desafio se contradiz (o texto de abertura não cita email; o requisito funcional cita). Decisão: aceita-se, validado quando presente.
- **Consulta é um instante, não um intervalo.** "Mesma hora" do requisito é igualdade de `scheduled_at`. Sobreposição por duração é DEBT-02.
<!-- /§regras -->

---

<!-- §banco -->

## Banco

### §banco.entidades

PostgreSQL 16. Nomenclatura em inglês, `snake_case`. Regras de banco: fonte única
em [contexto_agentes/review-database.md](contexto_agentes/review-database.md).

| #   | Tabela               | PK        | Agregado              | Fase | O que guarda                                  |
| --- | -------------------- | --------- | --------------------- | ---- | --------------------------------------------- |
| 1   | `doctors`            | `id` uuid | Doctor                | F2   | credencial e identidade do médico             |
| 2   | `refresh_tokens`     | `id` uuid | RefreshSession        | F2   | sessão revogável; hash SHA-256, nunca o token |
| 3   | `patients`           | `id` uuid | Patient               | F3   | perfil do paciente + carimbo de anonimização  |
| 4   | `appointments`       | `id` uuid | Appointment (raiz)    | F4   | compromisso da agenda com status              |
| 5   | `consultation_notes` | `id` uuid | Appointment (interna) | F5   | observação do atendimento                     |

### §banco.relacionamentos

```
doctors ─┬─< patients ─────< appointments >─── (doctor_id)
         ├─< appointments                    │
         └─< refresh_tokens                  └─< consultation_notes
```

- `patients.doctor_id → doctors` · `appointments.doctor_id → doctors` · `appointments.patient_id → patients` · `consultation_notes.appointment_id → appointments` · `refresh_tokens.doctor_id → doctors`

### §banco.decisoes

| Decisão                                                                                                | Razão                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **UUID** como PK, gerado por `gen_random_uuid()`                                                       | ID não sequencial não vaza volume nem permite enumeração                                                                                                                 |
| **Sem soft-delete genérico**                                                                           | Cada tabela declara o que "excluir" significa nela: `patients.anonymized_at` (LGPD) e `appointments.status = CANCELLED` (agenda)                                         |
| **Índice único parcial** `uk_appointments_doctor_slot ... WHERE status <> 'CANCELLED'`                 | Única forma de fechar a corrida entre duas requisições simultâneas (INV-01)                                                                                              |
| **`numeric`, nunca `float`**, para altura e peso                                                       | Arredondamento em dado clínico é defeito. Exige transformer no TypeORM: `numeric` volta como string                                                                      |
| **`varchar` + `CHECK`**, não `enum` nativo                                                             | Alterar enum no Postgres exige migration desconfortável; o CHECK dá a mesma garantia mais barato                                                                         |
| **`timestamptz`** para instante; `date` puro só em `birth_date`                                        | Nascimento não tem fuso                                                                                                                                                  |
| **Migration gerada por `migration:generate`, revisada e comitada**; `synchronize: false`; forward-only | O schema sai das entities, mas quem aprova é humano. A entity declara os nomes (`pk_`, `uk_`, `ck_`, `where` do índice parcial); sem isso o gerador inventa `UQ_a1b2c3…` |
| **`migrationsRun: false`** — migration roda por comando, nunca no boot                                 | Schema mudando sozinho ao subir container é a mesma doença do `synchronize`, com outro nome                                                                              |
| **Quatro das cinco FKs são escritas à mão** na revisão da migration                                    | Agregados se referenciam por ID (ADR-04), então não há `@ManyToOne` de onde o gerador as derive. A única que ele emite sozinho é `consultation_notes → appointments`, porque a anotação é entidade **interna** do agregado (`PLAN.md §16.4`) |
| **`consultation_notes` não tem `doctor_id`**                                                           | O escopo vem da raiz do agregado. Uma segunda cópia poderia divergir e apontar para outro consultório — a integridade passaria a depender de as duas concordarem         |

<!-- /§banco -->

---

<!-- §adrs -->

## ADRs

| ADR        | Decisão                                                                                                                                         | Alternativa rejeitada                                                  | Preço / razão                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ADR-01** | **NestJS 10**, com a injeção de dependência do próprio framework (módulos, providers, tokens), na **estrutura de pastas da referência técnica** | Express com composition root manual                                    | O projeto espelha a arquitetura de referência: mesmas camadas, mesmo mecanismo `*.module.ts` + `*.provider.ts`. DI, guards, pipes e filtros vêm do framework; o que se avalia é **como as camadas se organizam sobre ele**                                                                                                                                    |
| **ADR-02** | Domínio define portas; infra implementa. O provider entrega o **adapter**, não o `Repository<T>`                                                | Injetar `Repository<T>` do TypeORM direto no service                   | O repositório cru acopla a regra ao ORM e obriga a mockar TypeORM no teste. Preço: 1 adapter por agregado. É a **única divergência deliberada** do espelho — mesmo mecanismo de provider, outra coisa saindo da fábrica                                                                                                                                       |
| **ADR-03** | **A entity é a entity do TypeORM**, com comportamento (métodos de regra) — sem modelo paralelo nem mapper                                       | Entidade de domínio pura + mapper domínio ⇄ ORM                        | Espelha a referência técnica e é o que faz `migration:generate` funcionar (o schema sai das entities). Preço declarado: decorators de ORM no modelo. O que **não** se admite é ORM no **caso de uso** — essa é a linha protegida por lint                                                                                                                     |
| **ADR-04** | Agregados se referenciam por ID; transação toca um agregado                                                                                     | Relações navegáveis entre agregados                                    | É o que impede join entre agregados de nascer. Preço: uma consulta a mais onde antes haveria join                                                                                                                                                                                                                                                             |
| **ADR-05** | `Either<L,R>` para erro esperado; exceção só para o inesperado                                                                                  | `throw` como fluxo de controle                                         | Erro de negócio vira valor tipado que o controller é obrigado a tratar                                                                                                                                                                                                                                                                                        |
| **ADR-06** | Erro de domínio carrega `code` estável **e** mensagem PT-BR                                                                                     | Catálogo de mensagens separado no gateway                              | Duas fontes de verdade para um texto custa mais do que rende nesta escala. `code` é o contrato; a mensagem é conveniência (DEBT-03)                                                                                                                                                                                                                           |
| **ADR-07** | Zod na borda é a única fonte de validação **e do Swagger** (`nestjs-zod` + `ZodValidationPipe` global)                                          | `class-validator` + `@ApiProperty` escrito à mão                       | Uma fonte só ⇒ a documentação nunca diverge do comportamento. Divergência consciente do espelho, onde Zod e Swagger são fontes separadas — e por isso derivam                                                                                                                                                                                                 |
| **ADR-08** | Migration **gerada pelo TypeORM** (`migration:generate`), revisada por humano e comitada; `synchronize: false`, forward-only                    | `synchronize: true`; ou migration 100% escrita à mão                   | O gerador economiza digitação, não decide o schema: a entity declara nomes de constraint e o SQL gerado é revisado antes de comitar. Migration aplicada nunca é editada — correção é migration nova                                                                                                                                                           |
| **ADR-09** | Invariante crítica é enforçada **também** no banco                                                                                              | Só checagem em aplicação                                               | Duas requisições passam pela checagem antes de qualquer uma gravar; o índice fecha a corrida e o `23505` vira 409                                                                                                                                                                                                                                             |
| **ADR-10** | LGPD por anonimização in-place                                                                                                                  | DELETE físico ou soft-delete simples                                   | O requisito exige apagar PII **e** manter histórico. Delete quebra FK; soft-delete não apaga PII nenhuma                                                                                                                                                                                                                                                      |
| **ADR-11** | JWT HS256 curto + **refresh opaco revogável, sem rotação**                                                                                      | RS256; JWT de refresh; rotação com detecção de reuso e janela de graça | RS256 só paga com terceiro validando. JWT de refresh não seria revogável — e revogar é o que faz o logout ser real. **A rotação foi cortada pelo prisma de simplicidade:** ela responderia a um item _desejável_ de uma linha do enunciado com família de tokens, auto-FK, janela de graça e os três testes mais frágeis da suíte. Preço declarado em DEBT-11 |
| **ADR-12** | Somente ambiente de desenvolvimento                                                                                                             | Build multi-stage, deploy em cloud                                     | O contexto é um desafio avaliado localmente; produção aqui é cenografia                                                                                                                                                                                                                                                                                       |
| **ADR-13** | Código em inglês, banco `snake_case`, mensagens ao usuário em PT-BR                                                                             | Nomenclatura corporativa PT-BR no banco                                | Convenção de outro cliente vira ruído inexplicável para quem avalia                                                                                                                                                                                                                                                                                           |

<!-- /§adrs -->

---

<!-- §roadmap -->

## Estado atual

Estado, não história. O **plano** de cada fase vive em [PLAN.md §13](PLAN.md); o
**registro de execução** (decisões da hora, scores de fricção, issues) vive no
sub-doc de sprint. Esta tabela é a única amarração canônica sprint ↔ fase.

| Sprint | Fase        | Entrega (resumo — plano em [PLAN.md §13](PLAN.md))                                                  | Sub-doc                                                                    | Estado |
| ------ | ----------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------ |
| 01.01  | F0          | Fundação: TS strict, ESLint com regra de fronteira, Jest, Docker, `/api/health`                     | [sprint-01.01](desenvolvimento/sprints/sprint-01.01-fundacao.md)           | ✅     |
| 01.02  | F1          | Kernel: `Either`, erro de domínio com `code`, filtro global, pipe Zod, data source                  | [sprint-01.02](desenvolvimento/sprints/sprint-01.02-kernel.md)             | ✅     |
| 01.03  | F6 (item 1) | OpenAPI antecipado: `/api/docs` navegável desde já, para que F2 nasça clicável                      | [sprint-01.03](desenvolvimento/sprints/sprint-01.03-openapi.md)            | ✅     |
| 02.01  | F2 (1/2)    | Credencial e login: `doctors`, `refresh_tokens`, primeira migration, cripto e `POST /auth/login`    | [sprint-02.01](desenvolvimento/sprints/sprint-02.01-credencial-e-login.md) | ✅     |
| 02.02  | F2 (2/2)    | Rotas protegidas: `JwtAuthGuard` global, `@Public()`, `@CurrentDoctor()`, `refresh`, `logout`, `me` | [sprint-02.02](desenvolvimento/sprints/sprint-02.02-rotas-protegidas.md)   | ✅     |
| 03.01  | F3          | `patients`: cadastro, listagem, edição, anonimização LGPD                                           | [sprint-03.01](desenvolvimento/sprints/sprint-03.01-pacientes.md)          | ✅     |
| 04.01  | F4          | `appointments`: agenda com recusa de conflito, reagendamento, cancelamento                          | [sprint-04.01](desenvolvimento/sprints/sprint-04.01-agenda.md)                                                                          | ✅     |
| 04.02  | F5          | `appointments`: anotações e linha do tempo do paciente                                              | [sprint-04.02](desenvolvimento/sprints/sprint-04.02-anotacoes.md)          | ✅     |
| 05.01  | F6          | Swagger: 400 e 401 por decorator, exemplos de corpo executáveis, seed de demonstração idempotente e gate do documento OpenAPI | [sprint-05.01](desenvolvimento/sprints/sprint-05.01-swagger-e-seed.md)     | ✅     |
| 05.02  | F7          | README para o avaliador e ER — **sem CI** (RNF-12 cortado, `PLAN.md §3.1`)                          | [sprint-05.02](desenvolvimento/sprints/sprint-05.02-readme-e-er.md)        | ✅     |
| 06.01  | —           | **Provas sob estresse:** concorrência no slot provada sob 20 VUs e verificada com o índice removido (ADR-09 / INV-01) · carga medida (p95/p99 sobre 500 pacientes e 2.000 consultas, sem débito aberto) — idempotência **cortada** na releitura do PDF (sub-doc, decisão 15; DEBT-05 reconfirmado) | [sprint-06.01](desenvolvimento/sprints/sprint-06.01-concorrencia-idempotencia-e-carga.md) | ✅     |

**Legenda:** ⬜ não iniciada · 🟨 em andamento · ✅ verde (`lint` + `build` + `test`).

> **Como a 05.02 fechou.** O teste dela não é suíte: é uma pessoa seguindo o README. Ele
> rodou duas vezes em 10/08/2026 — antes do push, sobre um snapshot fiel do futuro
> commit, e depois dele a partir de um **`git clone` real** de `origin/main`, com
> diretório, container e volume criados do zero. Nas duas, os 14 passos do README e os
> 10 do roteiro saíram verdes. Registro em
> [sprint-05.02 §passo-9](desenvolvimento/sprints/sprint-05.02-readme-e-er.md).

**Uma sprint não tem fase**, e está declarada:

- **06.01** — a transversal das provas sob estresse. Não tem fase porque não entrega
  feature: entrega a **prova** de que features já entregues sobrevivem a
  concorrência e volume — retry ficou fora do escopo na releitura do PDF
  (sub-doc, decisão 15; DEBT-05 reconfirmado). Decisão do usuário em 09/08/2026 para o teste
  concorrente do slot, estendida a toda a classe de prova em 10/08/2026.
  **A regra que a governa é [PLAN.md §3.2](PLAN.md)** — sprint de feature entrega a
  regra, a 06.01 entrega a prova. Esta linha não a repete: aponta.

**Numeração:** `NN.MM` — `NN` é a sprint (agrupamento entregável), `MM` é o sub-doc
dentro dela. Nenhuma fase de `PLAN.md §13` existe fora desta tabela; nenhum sub-doc
de sprint existe sem linha aqui. Sub-doc criado **antes** de codificar
([CLAUDE.md §Documentação](../../CLAUDE.md)).

**Acréscimo não previsto** — sprint transversal, registro de sessão, planejamento
antecipado — ocupa o **próximo `MM` livre da sprint corrente**, com fase `—` e o
motivo declarado. A numeração já planejada nesta tabela é **reservada**: não se
desloca, não recebe sub-doc intercalado, e o acréscimo não vira sprint nova. Regra em
[SPRINT-TEMPLATE.md §nomeacao](SPRINT-TEMPLATE.md).

**Fora do escopo, por decisão:** produção e cloud (ADR-12) · **pipeline de CI
(RNF-12, cortado em 10/08/2026 — `PLAN.md §3.1`, sem débito)** · Redis, filas e
eventos de domínio · RBAC com múltiplos papéis (DEBT-08) · frontend.

**Pontos de extensão nomeados** (não implementados, e o motivo está no ledger):
`Idempotency-Key` em POST (DEBT-05) · limpeza agendada de refresh tokens (DEBT-06)
· rate limiting no login (DEBT-07) · sobreposição de consulta por duração (DEBT-02)
· fuso do consultório na agenda (DEBT-10).

<!-- /§roadmap -->
