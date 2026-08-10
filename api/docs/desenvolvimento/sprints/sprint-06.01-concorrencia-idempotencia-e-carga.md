# Sprint 06.01 — Concorrência, idempotência e carga (sem fase — regra em PLAN.md §3.2)

> Sumário:
> - §objetivo — o que esta sprint entrega e por quê
> - §decisoes — o que foi decidido na execução, com rationale
> - §nomes — identificadores fixados antes de codar
> - §escopo — plano ordenado por dependência
> - §edge-cases — os casos não-óbvios (insumo do [Dominio])
> - §checklist — o gate pré-fechamento
> - §scores — fricção PRÉ e PÓS, por agente
> - §issues — o que apareceu durante a implementação
>
> **Regra canônica:** [PLAN.md §3.2](../../PLAN.md) · **Estado:** [PRODUCT.md §roadmap](../../PRODUCT.md)

**Branch:** `main` · **Início:** — · **Fase:** — (transversal)
**Status:** ⬜ não iniciada
**Agentes acionados:** `[QA]` `[Database]`* `[Backend]`* `[Produto]`* — *(condicionais, ver §objetivo)*

> **Esta sprint não tem fase de `PLAN.md §13`**, e isso é regra, não exceção: ela não
> entrega feature. Entrega a **prova** de que features já entregues sobrevivem a
> concorrência, volume e retry. A regra que a governa é
> [PLAN.md §3.2](../../PLAN.md); a amarração está em
> [PRODUCT.md §roadmap](../../PRODUCT.md).

---

<!-- §objetivo -->

## Objetivo

Hoje o ProntoMed entrega CRUDs **corretos e não provados sob estresse**. As sete
invariantes têm teste nomeado, e todo teste nomeado prova a mesma coisa: que a regra
**existe** e rejeita o caso que deve rejeitar. Nenhum deles dispara duas requisições
ao mesmo tempo, nenhum enche uma tabela, nenhum repete um `POST`.

Depois desta sprint, três frases que hoje são projeto passam a ser fato verificado:

1. **O índice único parcial de INV-01 resolve o empate.** Duas requisições
   simultâneas no mesmo slot produzem **exatamente um 201 e um 409** — e o 409 é o
   humano do catálogo, não um 500 de `QueryFailedError` vazando. Este é o único
   ponto do sistema onde a corrida corrompe dado de verdade: agenda com dois
   pacientes no mesmo horário é o defeito que o requisito RF-07 existe para impedir.
2. **O retry tem comportamento conhecido.** Ou o `Idempotency-Key` entra, ou o
   DEBT-05 é reconfirmado com o teste que mostra o que acontece hoje —
   ver decisão 2, que está **em aberto** e é a primeira coisa a resolver.
3. **O sistema tem um número.** Nenhum requisito pede performance (varrido:
   RNF-01 a RNF-12 não mencionam), então a carga aqui não persegue meta: ela mede,
   registra e vira ou tranquilidade ou débito com número.

**Módulos impactados:** `test/integration/` (specs novos) · `test/` (config de pool)
· `infrastructure/.../seeds/` (seed de volume, separado do demo) ·
**condicionalmente** `gateways/http/` e uma migration, se a decisão 2 aprovar o
`Idempotency-Key`.

**Risco principal se falhar:** o teste de concorrência é **o mais frágil da suíte** —
é a razão de ele ter saído da F4. Se o pool serializar, ele passa provando o oposto
do pretendido: verde permanente que não testa nada. Um teste de corrida que mente é
pior que a ausência declarada que temos hoje, porque a ausência está registrada em
quatro documentos e o falso-verde não estaria em nenhum.

**Agentes obrigatórios e por qual gatilho** ([CLAUDE.md §Ativação](../../../../CLAUDE.md)):

| Agente | Gatilho | Fora do limite? |
| --- | --- | --- |
| `[QA]` | a sprint **é** testes; e `review-testing.md §regras` tem seção própria de determinismo em concorrência | sim |
| `[Database]` | **só se** a decisão 2 aprovar `Idempotency-Key` com tabela — aí há migration | sim, se acionado |
| `[Backend]` | **só se** a idempotência virar interceptor ou guard: é fronteira de `gateways/http` | não |
| `[Produto]` | **só se** um header novo entrar no contrato — muda o que o cliente da API lê, e o Swagger | não |

> **`[Seguranca]` não entra por padrão.** Nada aqui toca auth, PII ou escopo por
> médico. O seed de volume gera dado sintético pelo mesmo critério da 05.01. Se a
> carga for rodada com log de request ligado, é `[DEVOLVE]` — log sob volume é o
> jeito mais fácil de vazar PII em massa.

**Fora do escopo desta sprint:**

| Fora | Onde vai |
| --- | --- |
| Otimizar o que a carga revelar (índice de texto, cursor no lugar de `OFFSET`) | Débito novo com número medido — **medir não é consertar**, e consertar sem requisito é o que `PLAN.md §3.1` corta |
| Rate limiting no login (DEBT-07) | Continua aberto: é defesa, não prova sob estresse |
| Limpeza agendada de refresh token (DEBT-06) | Continua aberto: exige scheduler, que não existe na POC |
| Teste de carga em CI | RNF-12 cortado em 10/08/2026, sem débito (`PLAN.md §3.1`) |

<!-- /§objetivo -->

---

<!-- §decisoes -->

## Decisões de execução

| # | Decisão | Escolha | Rationale | Alternativa descartada |
| --- | --- | --- | --- | --- |
| 1 | Escopo da sprint | As **três** frentes: concorrência, idempotência e carga | Decisão do usuário em 10/08/2026: escala, carga e concorrência não entram em sprint de feature e ganham sprint específica. É a regra que virou `PLAN.md §3.2` | Três sub-docs separados (06.01/06.02/06.03) — descartado por ele: a classe de prova é uma só |
| 2 | **`Idempotency-Key` entra?** | **EM ABERTO — resolver na fricção PRÉ, antes de qualquer código** | O ledger trabalha contra: `DEBITOS-TECNICOS.md` DEBT-05 declara que *"o ganho não paga a mecânica de armazenar e expirar chaves"* e fixa o gatilho de reabertura em *"cliente com retry automático criando recursos sem chave natural"* — **que não ocorreu**. Implementar assim mesmo é pagar um custo que o próprio ledger disse não valer, e ainda reabre Swagger e README fechados na 05. Se a resposta for não, a frente vira **um teste** que documenta o comportamento atual do retry e o DEBT-05 é reconfirmado com evidência | Decidir agora, em qualquer direção, sem a fricção — que é como um débito justificado vira trabalho por inércia |
| 3 | Ferramenta de carga | **Nenhuma dependência nova**: script Node com `Promise.all` e concorrência parametrizada | `autocannon`/`k6` são a resposta certa para um sistema com meta de performance. Aqui não há RNF que peça, e `PLAN.md §3.1` cobra o preço de toda dependência na leitura do avaliador | `autocannon` (mais honesto como medida, e é superfície nova para provar algo que ninguém pediu) |
| 4 | Onde o teste de concorrência roda | `test/integration/`, banco `prontomed_test`, pool **≥2** explicitamente configurado no spec | `review-testing.md §regras` já fixa: pool com 1 conexão faz o driver serializar e o teste passa provando o oposto. A configuração vai **no spec**, visível, não num default global que alguém muda sem perceber | Pool global no DataSource de teste — mudança invisível que quebra o teste em silêncio |
| 5 | Asserção do teste concorrente | Sobre o **conjunto** (`[201, 409]` em qualquer ordem) **+** contagem no banco: exatamente uma linha viva no slot | Afirmar qual chegou primeiro é afirmar o que o Postgres não promete. A contagem é o que prova a invariante; os status provam que o erro foi **traduzido** e não vazou como 500 | `expect(primeira).toBe(201)` — flaky por construção |
| 6 | Seed de volume | Arquivo **separado** do `demo.seed.ts`, com script próprio | O demo é guardado por existência do médico (05.01, decisão 8) e espelha os wireframes: encher ele de ruído destrói o roteiro do README. São dois propósitos, dois arquivos | Parametrizar o `demo.seed.ts` com um `--count` — funde o seed que o avaliador roda com o que a carga precisa |
| 7 | O que fazer com o número da carga | Registrar em §issues e, se ruim, abrir débito **com o número medido** | Débito com número é acionável; "está lento" é opinião. E o projeto já tem dois candidatos nomeados: `ILIKE` sem índice (03.01, decisão 12) e paginação por `OFFSET` (DEBT-09) | Otimizar direto ao encontrar — vira sprint de performance que ninguém pediu |

> Nenhuma destas decisões muda agregado ou invariante. **A decisão 2 pode gerar ADR
> e migration** — se ela aprovar o `Idempotency-Key`, `[Database]` entra fora do
> limite e a tabela nova passa por `review-database.md §regras` antes de existir.

<!-- /§decisoes -->

---

<!-- §nomes -->

## Nomes fixados

**Definir ANTES de codar.** Código e banco em inglês; mensagem ao usuário em PT-BR (ADR-13).

| Tipo | Nome | Onde | Descrição |
| --- | --- | --- | --- |
| Spec | `appointment-concurrency.e2e-spec.ts` | `test/integration/` | Duas requisições simultâneas no mesmo slot (ADR-09) |
| Spec | `retry-behavior.e2e-spec.ts` | `test/integration/` | O que acontece hoje com `POST` repetido — nome vale nos dois desfechos da decisão 2 |
| Arquivo | `load.seed.ts` | `infrastructure/databases/typeorm/postgres/seeds/` | Seed de volume, separado do demo (decisão 6) |
| Script | `npm run seed:load` | `package.json` | Popula volume para medição |
| Constante | `LOAD_PATIENT_COUNT` · `LOAD_APPOINTMENT_COUNT` | `load.seed.ts` | Volume gerado, explícito e não mágico |
| Constante | `CONCURRENT_REQUESTS` | `appointment-concurrency.e2e-spec.ts` | Requisições disparadas no mesmo slot (≥2) |

**Condicionais — só existem se a decisão 2 aprovar o `Idempotency-Key`:**

| Tipo | Nome | Onde | Descrição |
| --- | --- | --- | --- |
| Header | `Idempotency-Key` | `gateways/http/` | Chave de idempotência em `POST` |
| Tabela | `idempotency_keys` | migration | Chave, rota, resposta gravada, expiração |
| Constraint | `uk_idempotency_keys_doctor_key` | `idempotency_keys` | Unicidade por médico (INV-04 vale aqui também) |
| Erro | `IDEMPOTENCY_KEY_CONFLICT` | `DomainError.code` | 409 — mesma chave, payload diferente |

> **Nome condicional não é nome fixado.** Estão aqui para a fricção PRÉ da decisão 2
> discutir sobre algo concreto. Se a decisão for não, este bloco inteiro sai do doc —
> não fica como "planejado para depois", que é como fantasma de escopo nasce.

<!-- /§nomes -->

---

<!-- §escopo -->

## Escopo — plano ordenado

**Ordem importa.** Todo caminho parte de `api/` (PLAN §10), exceto `RAIZ`.

| # | Ação | Arquivo | Tipo | Depende de |
| --- | --- | --- | --- | --- |
| 0 | **Resolver** | decisão 2 (`Idempotency-Key` entra ou não) na fricção PRÉ | — | — |
| 1 | Criar | `test/integration/appointment-concurrency.e2e-spec.ts` — pool ≥2, asserção sobre conjunto, contagem no banco | NOVO | — |
| 2 | Criar | `test/integration/retry-behavior.e2e-spec.ts` — `POST` repetido em cada rota de criação | NOVO | 0 |
| 3 | Criar | `src/infrastructure/databases/typeorm/postgres/seeds/load.seed.ts` | NOVO | — |
| 4 | Editar | `package.json` — script `seed:load` | ALTER | 3 |
| 5 | Medir | Carga sobre listagem de pacientes, timeline e agenda; registrar números em §issues | — | 3, 4 |
| 6 | Editar | `DEBITOS-TECNICOS.md` — DEBT-05 fechado **ou** reconfirmado com evidência; débito novo se a carga revelar número ruim (decisão 7) | ALTER | 2, 5 |
| 7 | Editar | `RAIZ README.md` — a seção *"O que estes testes ainda não provam"* deixa de valer para o que passou a ser provado | ALTER | 1, 2, 5 |
| 8 | Editar | `PLAN.md §3.2` e `§12.4` — o adiamento vira entrega; a linha do teste concorrente perde a ressalva | ALTER | 1 |
| 9 | Editar | `PRODUCT.md §invariantes` — a ressalva sobre INV-01 sai quando a corrida estiver provada | ALTER | 1 |
| 10 | Editar | `contexto_agentes/review-testing.md` — o item condicional do checklist passa a ser cobrável | ALTER | 1 |
| 11 | Rodar | `lint` · `typecheck` · `build` · `test` · `test:e2e` | — | 1-10 |

**Passos condicionais à decisão 2** (só existem se ela aprovar): entity + migration
de `idempotency_keys` · interceptor ou guard em `gateways/http` · `@ApiHeader` nas
rotas de criação · atualização de `PLAN.md §12` e `§9`.

### Migrations

**Nenhuma, se a decisão 2 for não.** Se for sim, uma: `idempotency_keys`, gerada por
`npm run migration:generate --name=idempotency`, revisada linha a linha contra
`review-database.md §regras` e aprovada por `[Database]` **antes** de qualquer
controller mudar.

<!-- /§escopo -->

---

<!-- §edge-cases -->

## Edge cases

| # | Caso | Comportamento esperado | Coberto por |
| --- | --- | --- | --- |
| 1 | Pool com 1 conexão | O driver **serializa** e o teste passa provando o oposto. É o modo de falha número um desta sprint | Pool ≥2 explícito no spec (decisão 4) + revisão do `[QA]` |
| 2 | `Promise.all` não garante simultaneidade real no servidor | O teste pode passar sem nunca ter havido corrida. A prova real é o **409 traduzido**: ele só aparece se as duas chegaram ao banco | Asserção sobre conjunto **+** contagem (decisão 5) |
| 3 | O `23505` vaza como **500** em vez de 409 | Falha. O filtro global traduz `QueryFailedError 23505` para 409 humano (`PLAN.md §16.2`) — este teste é a primeira vez que esse caminho é exercitado de verdade | Spec do passo 1 |
| 4 | Cancelar e agendar no mesmo slot, simultaneamente | O índice é parcial (`WHERE status <> 'CANCELLED'`): o cancelamento libera. Aceitável qualquer um dos dois desfechos — **nunca** duas linhas vivas | Contagem no banco |
| 5 | Duas anotações simultâneas na mesma consulta | **Ambas gravam** — não há unicidade a defender. Herdado de [sprint-04.02](sprint-04.02-anotacoes.md) §edge-cases 15, que mandou o caso para cá | Spec do passo 1 |
| 6 | Anotar numa consulta sendo cancelada ao mesmo tempo | INV-05 sob corrida **não é enforçável sem trigger** — limite já aceito na fricção PRÉ da 04.02 (`[Database]`, BAIXO). O dano é uma nota em consulta cancelada, não agenda corrompida | Documentar; **não** implementar trigger |
| 7 | Dois refresh concorrentes com o mesmo token | **Dois 200** — sem rotação o refresh não muda de estado (ADR-11). Já provado na [sprint-02.02](sprint-02.02-rotas-protegidas.md) §edge-cases 13 | **Não repetir** — já coberto |
| 8 | Seed de carga rodado contra o banco de **desenvolvimento** | Destrói o estado do demo e o roteiro do README. O script escreve onde a env mandar — e é fácil errar | Guarda explícita no `load.seed.ts` + `[QA]` |
| 9 | Carga contra `prontomed_test` durante `test:e2e` | Os specs limpam estado em `beforeEach`: medição e suíte na mesma base se atropelam | Medir com a suíte parada |
| 10 | Retry de `POST /appointments` idêntico | **409 determinístico** pela chave natural `(doctor_id, scheduled_at)` — é a razão de o DEBT-05 excluir o agendamento. Confirmar que é verdade, não assumir | Spec do passo 2 |
| 11 | Retry de `POST /patients` idêntico | **Duas linhas** — `patients` não tem unicidade natural. É exatamente o que o DEBT-05 declara; o teste transforma a declaração em evidência | Spec do passo 2 |
| 12 | Teste de concorrência intermitente (verde/vermelho alternado) | **Não estabilizar com `sleep`** — proibição ALTA em `review-testing.md §regras`. Instabilidade aqui é sintoma de asserção errada, não de tempo curto | `[QA]`, gate |

<!-- /§edge-cases -->

---

<!-- §checklist -->

## Checklist anti-erro (pré-fechamento)

**Verde**
- [ ] `npm run lint && npm run typecheck && npm run build && npm test && npm run test:e2e` — todos verdes
- [ ] Suíte de concorrência rodada **10 vezes seguidas** sem intermitência — um verde só não prova determinismo

**A prova em si**
- [ ] Pool com ≥2 conexões, **explícito e visível** no spec (decisão 4)
- [ ] Asserção sobre o **conjunto**, nunca sobre ordem de chegada (decisão 5)
- [ ] Contagem final no banco: **exatamente uma** linha viva no slot
- [ ] O 409 é o **humano do catálogo**, não `QueryFailedError` vazando como 500
- [ ] O teste **falharia** se o índice único parcial fosse removido — verificado removendo-o de propósito, uma vez

**Decisão 2**
- [ ] Resolvida na fricção PRÉ, **antes** de qualquer código do passo 2
- [ ] Se **não**: DEBT-05 reconfirmado no ledger com o teste como evidência, e o bloco condicional de §nomes **removido** deste doc
- [ ] Se **sim**: ADR aberta em `PRODUCT.md §adrs`, migration aprovada por `[Database]`, contrato revisado por `[Produto]`, Swagger com `@ApiHeader`

**Higiene**
- [ ] Nenhum `sleep`, nenhuma dependência de ordem, nenhuma data incontrolada
- [ ] Seed de volume não escreve no banco de desenvolvimento (edge case 8)
- [ ] Nenhuma dependência nova no `package.json` (decisão 3)
- [ ] Números da carga registrados em §issues **com o volume que os produziu**
- [ ] Scores ≥ 9/10 na fricção PÓS; zero CRÍTICO e zero ALTO em aberto

**Docs — o que esta sprint torna obsoleto**
- [ ] `RAIZ README.md` §*"O que estes testes ainda não provam"* corrigido: o que passou a ser provado sai da tabela
- [ ] `PLAN.md §3.2` — o parágrafo do preço declarado atualizado; adiamento vira entrega
- [ ] `PLAN.md §12.4` — a linha do teste concorrente perde a ressalva "sprint de rigor (06.01), não F4"
- [ ] `PRODUCT.md §invariantes` — a ressalva sobre a INV-01 sai
- [ ] `PRODUCT.md §roadmap` — 06.01 marcada ✅
- [ ] `contexto_agentes/review-testing.md` — matriz, checklist e anti-falso-positivo deixam de tratar a prova como fora de escopo
- [ ] `DEBITOS-TECNICOS.md` — DEBT-05 resolvido ou reconfirmado; débito novo só **com número medido**

<!-- /§checklist -->

---

<!-- §scores -->

## Scores de fricção

| Agente | Fase | Score | Severidade máxima | Observação |
| --- | --- | --- | --- | --- |
| `[QA]` | PRÉ | /10 | | |
| `[Database]` | PRÉ | /10 | | *(só se decisão 2 = sim)* |
| `[Backend]` | PRÉ | /10 | | *(só se decisão 2 = sim)* |
| `[Produto]` | PRÉ | /10 | | *(só se decisão 2 = sim)* |
| `[QA]` | PÓS | /10 | | |

<!-- /§scores -->

---

<!-- §issues -->

## Issues encontrados durante a implementação

| # | Issue | Causa | Resolução | Arquivos | Débito |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

### Medições de carga

**Registrar com o volume que produziu o número** — número sem volume não é medida.

| Cenário | Volume | Resultado | Débito aberto? |
| --- | --- | --- | --- |
| Listagem de pacientes (`ILIKE`, sem índice de texto) | | | |
| Linha do tempo do paciente | | | |
| Listagem da agenda | | | |

<!-- /§issues -->

---

<!-- §riscos -->

## Riscos e mitigações

| Risco | Impacto | Mitigação | Gatilho de reabertura |
| --- | --- | --- | --- |
| Teste de concorrência verde sem nunca ter havido corrida | Falso-verde permanente — pior que a ausência declarada de hoje, porque a ausência está registrada em quatro documentos e o falso-verde não estaria em nenhum | Pool ≥2 explícito · remover o índice de propósito uma vez e ver o teste **falhar** · 10 execuções seguidas | Qualquer intermitência |
| Idempotência implementada por inércia | Superfície nova (tabela, header, expiração) para um gatilho que o ledger diz não ter ocorrido | Decisão 2 é o passo **0** do escopo, resolvida em fricção PRÉ | Cliente com retry automático aparecer |
| Carga vira sprint de otimização | O prisma corta: nenhum RNF pede performance | Decisão 7 — medir e registrar; consertar é outra decisão, com o número na mão | Número que inviabilize o roteiro do README |
| Sprint cair por tempo | As três frentes ficam sem prova | É a última da fila, e o preço já está declarado em `PLAN.md §3.2` e na tabela do README | — |

<!-- /§riscos -->
