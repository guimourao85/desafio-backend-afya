# Sprint 06.01 — Concorrência e carga (sem fase — regra em PLAN.md §3.2)

> Sumário:
> - §objetivo — o que esta sprint entrega e por quê
> - §decisoes — o que foi decidido, com rationale (inclui o corte da idempotência)
> - §nomes — identificadores fixados antes de codar
> - §escopo — plano ordenado por dependência
> - §contrato — o desenho aprovado (k6, compose, seed, comando único)
> - §edge-cases — os casos não-óbvios (insumo do [Dominio])
> - §checklist — o gate pré-fechamento
> - §scores — fricção PRÉ e re-crítica, por agente
> - §issues — o que apareceu durante a implementação
> - §riscos — riscos e mitigações
>
> **Regra canônica:** [PLAN.md §3.2](../../PLAN.md) · **Estado:** [PRODUCT.md §roadmap](../../PRODUCT.md)

**Branch:** `main` · **Início:** 10/08/2026 · **Fim:** 10/08/2026 · **Fase:** — (transversal)
**Status:** ✅ **fechada** — concorrência provada e verificada ao contrário, carga
medida sem débito aberto, idempotência cortada (decisão 15) com DEBT-05 reconfirmado
**Agentes da fricção PÓS:** `[Backend]` 9/10 · `[QA]` 9/10 — ver §scores

> **O nome do arquivo preserva o escopo original** (concorrência, idempotência e
> carga) por rastreabilidade de links — `PLAN.md §3.2` e o roadmap apontam para cá.
> A idempotência foi **cortada** na releitura do PDF do desafio (decisão 15).

> **⚠️ Este documento é auto-contido e determinístico.** Reescrito em 10/08/2026,
> depois da fricção PRÉ, da re-crítica e da releitura do PDF: quem abrir uma sessão
> nova lê `CLAUDE.md` + este arquivo e executa o §escopo de contexto zero. Onde há
> decisão, ela está em §decisoes; onde há forma exata, ela está em §contrato.

---

<!-- §objetivo -->

## Objetivo

Hoje o ProntoMed entrega CRUDs **corretos e não provados sob estresse**. As sete
invariantes têm teste nomeado, e todo teste nomeado prova que a regra **existe** e
rejeita o caso que deve rejeitar. Nenhum deles dispara duas requisições ao mesmo
tempo e nenhum enche uma tabela.

Depois desta sprint, duas frases que hoje são projeto passam a ser fato verificado:

1. **O índice único parcial de INV-01 resolve o empate.** N requisições simultâneas
   no mesmo slot produzem **exatamente um 201 e N-1 conflitos 409** — e o 409 é o
   humano do catálogo (`SCHEDULE_CONFLICT`), não um 500 de `QueryFailedError`
   vazando. É o único ponto do sistema onde a corrida corrompe dado de verdade, e é
   o desejável que o PDF cita ("não deixar cadastrar mais de um paciente na mesma
   hora") levado até onde um sênior o leva: provado sob corrida real, com
   contraprova de que o teste testa (§escopo, execução B).
2. **O sistema tem um número que o avaliador lê.** Nenhum requisito pede
   performance, então a carga não persegue meta: mede **p95 e p99**, registra com o
   volume que os produziu e vira ou tranquilidade ou débito com número. O valor não
   é o milissegundo — medido em Docker sobre WSL2, ele não transfere — é a
   **metodologia**: "medi, eis a forma da curva, eis o débito quantificado, não
   otimizei porque nenhum RNF pede".

**ROI na visão do avaliador** (pedido × entregue × diferencial): o overbooking
ancora no único desejável do PDF sobre a agenda; a carga é diferencial puro e barato
(~3 arquivos, zero banco); a idempotência era a maior superfície da sprint para o
único item **sem nenhuma linha no PDF** — cortada (decisão 15).

**A prova é por demonstração, não por regressão — e isso tem preço.** Decisão 8:
teste unitário e de integração não atacam concorrência. A prova vive no k6, que roda
por **um comando** (`npm run test:stress`, que resolve o seed sozinho — decisão 17)
e não em `npm run test:e2e`. Como RNF-12 (CI) foi cortado, **nada roda essa prova
automaticamente**. O preço está declarado aqui, no `README` e em `PLAN.md §12.4`.

**Módulos impactados:** `infrastructure/.../seeds/` (seed de volume) ·
`test/stress/` (novo) · `api/package.json` (2 scripts) · `RAIZ docker-compose.yml`
(1 serviço). **Nenhuma migration, nenhuma mudança em `src/` fora do seed.**

**Risco principal se falhar:** o k6 sozinho **não distingue** "o índice fechou a
corrida" de "o pré-SELECT do caso de uso pegou por escalonamento". Nos dois casos a
saída é `1× 201 + N-1× 409`. Verde permanente que não testa nada é pior que a
ausência declarada de hoje. **A mitigação é a execução B do §escopo** — rodar uma
vez com o índice removido e ver o overbooking acontecer.

**Fora do escopo desta sprint:**

| Fora | Onde vai |
| --- | --- |
| **`Idempotency-Key` (inteira: tabela, interceptor, header)** | **Cortada — decisão 15.** DEBT-05 permanece aberto e reconfirmado, com o rationale registrado |
| Otimizar o que a carga revelar (índice de texto, cursor no lugar de `OFFSET`) | Débito novo com número medido — **medir não é consertar** (`PLAN.md §3.1`) |
| Rate limiting no login (DEBT-07) · limpeza de refresh token (DEBT-06) | Continuam abertos — não são prova sob estresse |
| Teste de carga em CI | RNF-12 cortado em 10/08/2026, sem débito |
| Redis, Redlock, `SELECT ... FOR UPDATE`, `statement_timeout` | Decisões 10 e 14 — rejeitados com rationale |

<!-- /§objetivo -->

---

<!-- §decisoes -->

## Decisões de execução

Decisões 1–7: abertura (09–10/08/2026). Decisões 8–14: fricção PRÉ de 10/08/2026.
**Decisões 15–20: re-crítica + releitura do PDF do desafio, 10/08/2026** — são as
que definem a forma final. As decisões 2, 9, 11 e 12 ficam como registro histórico:
**tornadas sem objeto pela decisão 15**.

| # | Decisão | Escolha | Rationale | Alternativa descartada |
| --- | --- | --- | --- | --- |
| 1 | Escopo da sprint | Prova sob estresse em sprint dedicada | Decisão do usuário; virou `PLAN.md §3.2` | Diluir nas sprints de feature |
| 2 | ~~`Idempotency-Key` entra?~~ | ~~SIM, em Postgres~~ — **revertida pela decisão 15** | (histórico) distinguir double-click de overbooking no k6 | — |
| 3 | Ferramenta de carga | **k6 dockerizado**, serviço no compose da raiz — *efêmero e sob `profiles` na forma original; **a decisão 21 o tornou permanente e ocioso***. A escolha da ferramenta segue de pé | Zero dependência no `package.json`, zero código em `src/`; p95/p99 em sumário pronto com sockets paralelos reais. Custo: 1 serviço no compose, 1 arquivo `.js`, 2 scripts npm, 1 seção no README | Script Node com `Promise.all` (cogitado duas vezes, morto duas vezes: sem os percentis, que a decisão 16 manteve) · `autocannon` |
| 4 | Pool de conexões | Sem configuração — o default do app é **10** | Verificado via `docker exec`: `pg-pool/index.js:89`; `database.providers.ts` não declara `extra` | — |
| 5 | Asserção do teste concorrente | Sobre o **conjunto**, nunca sobre ordem | Afirmar qual chegou primeiro é afirmar o que o Postgres não promete. Vira contador com threshold + `teardown()` contando linha viva | `expect(primeira).toBe(201)` — flaky por construção |
| 6 | Seed de volume | Arquivo **separado** do `demo.seed.ts` | O demo espelha os wireframes e o roteiro do README; encher de ruído destrói os dois propósitos | Parametrizar `demo.seed.ts` |
| 7 | O que fazer com o número | Registrar em §issues; se ruim, débito **com o número** | Débito com número é acionável. Candidatos já nomeados: `ILIKE` sem índice, `OFFSET` (DEBT-09) | Otimizar direto |
| 8 | Onde a concorrência é provada | **Só no k6** | Decisão do usuário. Jest não ataca corrida; `PLAN.md §12.4` muda a linha de `int.` para `carga (k6)` | Spec jest concorrente |
| 9 | ~~Escopo da idempotência~~ | ~~Só `POST /appointments`~~ — **sem objeto (decisão 15)** | (histórico) achado D1: PII em `response_body` fora do alcance da anonimização. O achado segue válido como princípio e é parte do porquê do corte ser barato | — |
| 10 | Redis | **Rejeitado** | Complexidade acidental numa POC; Postgres já está lá. Segue valendo como precedente de escopo | Redis com TTL |
| 11 | ~~Expiração das chaves~~ | ~~TTL 24h + DELETE oportunístico~~ — **sem objeto (decisão 15)** | (histórico) | — |
| 12 | ~~INV-08~~ | ~~Invariante da UNIQUE de idempotência~~ — **sem objeto (decisão 15)**; nenhuma UNIQUE nova existe | (histórico) | — |
| 13 | Prova anti-falso-verde | **Procedimento manual documentado**, executado uma vez, saída em §issues — não um script npm | Achado Q1. Script npm que dá `DROP INDEX` em constraint de invariante é o footgun que `review-database.md` existe para impedir | `npm run test:stress:proof` |
| 14 | `statement_timeout` global | **Rejeitado** | Não há transação multi-statement nem `FOR UPDATE` no caminho; superfície sem sintoma | `extra: { statement_timeout }` |
| 15 | **Idempotency-Key: corte total** | **Fora da sprint — reverte a decisão 2** | **Releitura do PDF em 10/08/2026, regra 1 do prisma (`PLAN.md §3.1`): nenhuma linha do desafio pede idempotência** — nem funcional, nem RNF, nem item de avaliação. Era a maior superfície da sprint (tabela + migration + porta + adapter + módulo + interceptor + header + TTL + INV + ADR) para o único item sem base no enunciado; e o desenho record-after-success tem janela sob simultaneidade (achado C1), que entregaria mecanismo não pedido **com limite conhecido**. O rationale original da decisão 2 (legibilidade do k6) morreu quando o cenário `double_click` deixou de ser concorrente. **DEBT-05 permanece aberto, reconfirmado** — retry de `POST /appointments` sem chave já tem 409 determinístico pela chave natural (edge 7) | Manter rebaixada (replay só sequencial): ainda custa tabela + migration + interceptor para requisito inexistente · Reserva estilo Stripe (correta sob corrida): máquina de estados numa POC — regra 3 do prisma corta |
| 16 | **Carga fica** | p95/p99 medidos e registrados | **Decisão do usuário em 10/08/2026: diferencial além do pedido.** O valor entregue é a seção do README com números + volume + débito quantificado — chega até ao avaliador que nunca roda o comando. Revalida o k6 (decisão 3) pelo rationale original | Cortar carga junto com a idempotência |
| 17 | **`test:stress` é comando único** | O script resolve o seed internamente — **segue valendo**; só a segunda metade mudou (decisão 21) | **Decisão do usuário.** O seed é **pré-condição de início**, não passo do operador: o `&&` faz disso condição, não sugestão. Roda no **host** porque é orquestração pura — o binário `docker` só existe lá. Seed **idempotente**: re-execução não duplica volume e custa < 1 s. *Comando da época, hoje revogado pela 21: `docker exec api-prontomed npm run seed:load && docker compose --profile stress run --rm k6`. A forma atual está em §contrato.comando-unico* | Dois comandos documentados (`seed:load` depois `test:stress`) |
| 18 | **Local dos artefatos de estresse** | `api/test/stress/` | **Decisão do usuário.** Nomeia a intenção (estresse), não a ferramenta (k6) | `api/test/k6/` |
| 19 | **Determinismo de re-execução** | Slot fixo (`STRESS_SLOT`); `setup()` limpa o slot; `teardown()` conta e **cancela** a linha vencedora | 3 execuções seguidas idênticas sem intervenção manual (checklist). Cancelar libera o slot porque o índice é parcial (`WHERE status <> 'CANCELLED'`) — o teardown exercita, de graça, a semântica que o edge 3 documenta | Slot derivado do relógio — data incontrolada, proibida por `review-testing.md` |
| 20 | **Limpeza na prova anti-falso-verde** | Passo obrigatório entre o overbooking e o `CREATE INDEX` | **Achado C2 da re-crítica:** a execução B produz N linhas vivas no mesmo slot **por desígnio**; recriar o índice único sobre elas falha com "duplicate keys" e deixaria o banco **sem a defesa da INV-01**. O procedimento ganha o passo 3 (cancelar as linhas do slot de estresse) antes do passo 4 | O procedimento original de 4 passos sem limpeza — falha determinística no próprio sucesso |
| 21 | **k6 sobe sempre, e ocioso** — reverte o `profiles` da decisão 3 | Sem `profiles`; `entrypoint: ['sleep', 'infinity']`; `test:stress` passa a `docker exec k6-prontomed k6 run ...` | **Decisão do usuário, 10/08/2026:** numa POC avaliada localmente, um único `docker compose up -d` tem de deixar tudo pronto — quem avalia não deve descobrir `--profile` nem puxar imagem em passo separado. **O `entrypoint` é o detalhe que faz a decisão funcionar:** a imagem do k6 é uma CLI, e com o `command` natural (`run /scripts/stress-test.js`) o container executaria o teste **no boot**, contra um banco sem migrations, morrendo com `Exited (99)` na cara de quem acabou de subir o projeto. Disponível ≠ disparado. Ganho colateral: o container já existe, então o teste começa sem custo de criação | Tirar só o `profiles`, mantendo `command: run ...` — dispara no boot e falha · Manter `profiles: ['stress']` — exige do avaliador uma flag que ele não tem por que conhecer |

<!-- /§decisoes -->

---

<!-- §nomes -->

## Nomes fixados

Código e banco em inglês; mensagem ao usuário em PT-BR (ADR-13). Todo caminho parte
de `api/`, exceto `RAIZ`.

| Tipo | Nome | Onde |
| --- | --- | --- |
| Script k6 | `stress-test.js` | `test/stress/` |
| Seed | `load.seed.ts` | `src/infrastructure/databases/typeorm/postgres/seeds/` |
| Script npm (container) | `seed:load` | `package.json` |
| Script npm (host, comando único) | `test:stress` | `package.json` |
| Serviço compose | `k6` (sobe sempre, ocioso — decisão 21) | `RAIZ docker-compose.yml` |
| Constantes do seed | `LOAD_PATIENT_COUNT` · `LOAD_APPOINTMENT_COUNT` | `load.seed.ts` |
| Médico de estresse | `k6.stress@prontomed.dev` | `load.seed.ts` |
| Constantes do k6 | `CONCURRENT_VUS = 20` · `STRESS_SLOT` (ISO fixo, futuro distante) | `stress-test.js` |

> **Removidos pela decisão 15:** `idempotency_keys` e todas as constraints, entity,
> porta, token, adapter, `IdempotencyModule`, `IdempotencyInterceptor`, headers
> `Idempotency-Key`/`Idempotent-Replay`, `IDEMPOTENCY_KEY_CONFLICT`, INV-08, ADR-14,
> `idempotency.e2e-spec.ts`. Nenhum deles existe nem deve existir no repo.

<!-- /§nomes -->

---

<!-- §escopo -->

## Escopo — plano ordenado

**Ordem importa.** A forma exata de cada item está em **§contrato**.

| # | Ação | Arquivo / alvo | Tipo | Depende de | Gate |
| --- | --- | --- | --- | --- | --- |
| 1 | Criar seed de volume (guarda `NODE_ENV=test`, idempotente) | `src/infrastructure/.../seeds/load.seed.ts` | NOVO | — | `[QA]` (edges 8–9) |
| 2 | Script `seed:load` | `package.json` | ALTER | 1 | — |
| 3 | Criar script k6 — 2 cenários (`overbooking`, `load`) | `test/stress/stress-test.js` | NOVO | — | `[QA]` |
| 4 | Serviço `k6` no compose + script `test:stress` (comando único) | `RAIZ docker-compose.yml` · `package.json` | ALTER | 2, 3 | — |
| 5 | **Execução A** — `npm run test:stress` **3× seguidas**, p95/p99 e contadores em §issues | — | — | 4 | — |
| 6 | **Execução B** — prova anti-falso-verde (procedimento abaixo), saída colada em §issues | — | — | 5 | **`[QA]`, bloqueante** |
| 7 | Cascata de documentação (lista fechada abaixo) | vários | ALTER | 5, 6 | — |
| 8 | `lint` · `typecheck` · `build` · `test` · `test:e2e` verdes | — | — | 1–7 | — |
| 9 | Fricção PÓS: `[Backend]` `[QA]` | — | — | 8 | **scores ≥9** |

### Execução B — procedimento exato da prova anti-falso-verde

```bash
# 1. Derruba a única defesa real contra a corrida
docker exec db-prontomed psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c 'DROP INDEX "uk_appointments_doctor_slot";'

# 2. Roda o cenário. ESPERADO: vários 201 — o overbooking acontecendo
npm run test:stress

# 3. LIMPEZA OBRIGATÓRIA (decisão 20): cancela as linhas vivas que o passo 2
#    criou de propósito no slot de estresse — sem isso o passo 4 falha com
#    "could not create unique index ... duplicate keys" e o banco fica SEM a
#    defesa da INV-01
docker exec db-prontomed psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "UPDATE appointments SET status = 'CANCELLED' WHERE scheduled_at = '<STRESS_SLOT>';"

# 4. Recria exatamente como a migration 1786310600161-sprint04.01-appointments.ts:41 criou
docker exec db-prontomed psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c $'CREATE UNIQUE INDEX "uk_appointments_doctor_slot" ON "appointments" ("doctor_id", "scheduled_at") WHERE status <> \'CANCELLED\';'
```

> **Se o passo 2 produzir `1× 201`, o teste é falso-verde** — o pré-SELECT de
> `schedule-appointment.service.ts:89` está mascarando por escalonamento e o k6
> nunca provou a corrida. Nesse caso: **issue aberta**, não checkbox. Aumentar
> `CONCURRENT_VUS` e repetir.

### Passo 7 — cascata de documentação (lista fechada)

| Documento | O que muda |
| --- | --- |
| `RAIZ README.md` §*"O que estes testes ainda não provam"* | Concorrência do agendamento passa a **provada por `npm run test:stress`** (comando manual, não regressão — dito assim). Volume ganha os números medidos. Retry/idempotência **continua não provada**: DEBT-05, com uma linha de rationale do corte |
| `RAIZ README.md` (seção nova) | Como rodar: `docker compose up -d` → `npm run test:stress` (um comando; o seed é resolvido internamente) — e **como ler** p95/p99 e os contadores. Vende metodologia e débito quantificado, nunca o milissegundo absoluto |
| `PLAN.md §3.2` | Adiamento vira entrega **parcial**: concorrência e volume provados; retry segue débito declarado (decisão 15) |
| `PLAN.md §12.3` | Nota sobre DEBT-05: **reconfirmado** em 10/08/2026 com o rationale da decisão 15 (não "reduzido" — o corte foi total) |
| `PLAN.md §12.4` | Linha *"duas requisições concorrentes no mesmo slot"*: camada muda de `int.` para **`carga (k6)`** |
| `PRODUCT.md §invariantes` | A nota-de-rodapé "INV-01 não provada sob corrida" sai após as execuções A e B |
| `PRODUCT.md §roadmap` | Linha da 06.01: escopo final (concorrência + carga; idempotência cortada, DEBT-05 reconfirmado) e ✅ ao fechar |
| `contexto_agentes/review-testing.md` | §regras (bloco *"Determinismo em teste de concorrência"*), a linha da INV-01 na tabela de §verifica, o anti-falso-positivo de §verifica e o item de §checklist: prova sob corrida passa a **cobrável na camada de carga**, e ausência de spec Jest concorrente deixa de ser achado |
| `DEBITOS-TECNICOS.md` | **DEBT-05 reconfirmado** (não fechado, não reduzido) com o rationale da decisão 15. Débito novo de performance **só com número medido** (decisão 7) |

> `PLAN.md §9`, `PRODUCT.md §banco` e `§adrs` **não mudam** — nenhum contrato HTTP,
> nenhuma tabela e nenhum ADR novo existem neste escopo.

### Migrations

**Nenhuma.** A sprint não toca schema — é a consequência mais barata da decisão 15.

<!-- /§escopo -->

---

<!-- §contrato -->

## Contrato aprovado

### §contrato.comando-unico

```jsonc
// api/package.json
"seed:load":   "ts-node -r tsconfig-paths/register src/infrastructure/databases/typeorm/postgres/seeds/load.seed.ts",
"test:stress": "docker exec api-prontomed npm run seed:load && docker exec k6-prontomed k6 run /scripts/stress-test.js"
```

`test:stress` roda **no host** porque é pura orquestração: ele não executa nada
localmente, só faz `docker exec` em dois containers — e o binário `docker` só existe
no host. O seed roda no container `api` (onde há `node_modules`) e o teste no
container `k6`, que a decisão 21 mantém de pé e ocioso.

`seed:load` **não é comando de uso** — existe porque `test:stress` precisa invocá-lo
por dentro do container. Nenhum documento voltado ao avaliador o menciona.

> **Forma anterior, revogada pela decisão 21:**
> `docker compose --profile stress run --rm k6`. Funcionava, e dependia de o compose
> v2 resolver o `docker-compose.yml` da raiz subindo diretórios a partir de `api/` —
> uma dependência a menos agora que o alvo é um container nomeado.

### §contrato.seed-de-carga

`load.seed.ts` cria **médico próprio** (`k6.stress@prontomed.dev`), seus pacientes
(`LOAD_PATIENT_COUNT`) e agendamentos (`LOAD_APPOINTMENT_COUNT`).

- **Recusa `NODE_ENV=test`** (edge 9) — nunca atropela `prontomed_test`.
- **Idempotente por existência** (decisão 17): se o médico de estresse já existe,
  não duplica volume — mesmo guard do `demo.seed.ts` (05.01, decisão 8).
- Escreve no banco de desenvolvimento; o estrago é **contido por INV-04**: a
  listagem do médico do demo não enxerga nada do médico de estresse.
  `docker compose down -v` reseta.

### §contrato.k6

`test/stress/stress-test.js`, atacando `http://api:3333/api` pela rede
`prontomed-net` (porta de `PORT` em `api/.env`; prefixo `api` de `app.setup.ts:15`).

**`setup()` roda uma vez e alimenta todos os VUs:** `POST /api/auth/login` com o
médico de estresse → `accessToken`; lê os `patientId` do seed; **limpa o slot**
(decisão 19): lista `GET /api/appointments?from=STRESS_SLOT&to=STRESS_SLOT&status=SCHEDULED`
e cancela o que houver — um run anterior abortado não pode contaminar este (edge 11).
Devolve `{ token, patientIds }`.

| Cenário | Executor | O que dispara | Asserção |
| --- | --- | --- | --- |
| `overbooking` | `shared-iterations`, `vus: 20`, `iterations: 20` | 20 pacientes **distintos**, **mesmo** `STRESS_SLOT` | `created_201 == 1` · `conflict_409 == 19` · todo 409 traz `code: 'SCHEDULE_CONFLICT'` |
| `load` | `constant-vus`, `startTime` após `overbooking` | `GET /patients?search=` (`ILIKE`) · `GET /patients/:id/appointments` · `GET /appointments` | p95/p99 por endpoint, via `tags` |

**Cenário é lido por `exec.scenario.name`, de `k6/execution`** — `__scenario`
**não é global do k6**: um `if` sobre ele deixa os blocos falsos, nenhuma requisição
sai e o sumário imprime `checks 100% ✓ 0 of 0` — falso-verde perfeito.

**Configuração — atenção à separação init-context × options** (achado C3: misturar
os dois faz o k6 ignorar o callback com warning e o sumário abre em ~95% de
`http_req_failed`):

```js
import http from 'k6/http';

// INIT CONTEXT — chamada de função, fora do objeto options:
// 409 é resultado ESPERADO no cenário overbooking.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 409));

// OPTIONS — objeto exportado:
export const options = {
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    'created_201{scenario:overbooking}':  ['count == 1'],
    'conflict_409{scenario:overbooking}': ['count == 19'],
    checks: ['rate == 1.00'],
  },
  scenarios: { /* tabela acima */ },
};
```

**`teardown()` fecha com a contagem no banco** — decisão 5 com outra ferramenta:
`GET /api/appointments?from=STRESS_SLOT&to=STRESS_SLOT&status=SCHEDULED` e asserção
de **exatamente 1 linha viva** (status prova que o erro foi **traduzido**; contagem
prova a **invariante**). Em seguida **cancela** essa linha (decisão 19) — o slot
volta livre e 3 execuções seguidas são idênticas.

**Sem `sleep`, sem asserção sobre ordem, sem data derivada do relógio**
(`review-testing.md:69-76`; `STRESS_SLOT` é constante).

### §contrato.compose

Forma final, depois da **decisão 21** — o serviço sobe junto com o resto e fica
ocioso; quem o aciona é `docker exec`, não o compose.

```yaml
  k6:
    image: grafana/k6:latest
    container_name: k6-prontomed
    # Sobe sempre: POC avaliada localmente, um `up -d` deixa tudo pronto (decisão 21).
    # `entrypoint` sobrescrito porque a imagem é uma CLI — com o `command` natural
    # (`run /scripts/stress-test.js`) o teste dispararia no boot, contra um banco sem
    # migrations, e morreria com `Exited (99)`. Disponível ≠ disparado.
    entrypoint: ['sleep', 'infinity']
    volumes: ['./api/test/stress:/scripts']
    environment:
      - API_URL=http://api:3333/api
    depends_on: [api]
    networks: [prontomed-net]
```

> **Desenho anterior (decisão 3), revogado pela 21:** `profiles: ['stress']` +
> `command: run /scripts/stress-test.js`, acionado por
> `docker compose --profile stress run --rm k6`. Ele tratava o k6 como ferramenta sob
> demanda; a 21 o trata como parte do ambiente, que é o que a POC pede.

<!-- /§contrato -->

---

<!-- §edge-cases -->

## Edge cases

| # | Caso | Comportamento esperado | Coberto por |
| --- | --- | --- | --- |
| 1 | **k6 verde sem nunca ter havido corrida** | Se os VUs serializarem, o pré-SELECT de `schedule-appointment.service.ts:89` pega e a saída é idêntica à do caso provado. Modo de falha número um da sprint | **Execução B** (índice removido) |
| 2 | O `23505` vaza como **500** em vez de 409 | Falha. `exception-filter.ts:110-118` traduz `QueryFailedError 23505` → 409 `SCHEDULE_CONFLICT`. Primeiro exercício real desse caminho | Cenário `overbooking` |
| 3 | Cancelar e agendar no mesmo slot, simultaneamente | O índice é parcial (`WHERE status <> 'CANCELLED'`): o cancelamento libera. Aceitável qualquer desfecho — **nunca** duas linhas vivas | `teardown()` (que aliás cancela e re-agenda a cada run — decisão 19) |
| 4 | Duas anotações simultâneas na mesma consulta | **Ambas gravam** — não há unicidade a defender ([04.02 §edge-cases 15](sprint-04.02-anotacoes.md)) | Documentar; sem teste |
| 5 | Anotar numa consulta sendo cancelada ao mesmo tempo | INV-05 sob corrida não é enforçável sem trigger — limite aceito na 04.02 (`[Database]`, BAIXO) | Documentar; **não** implementar trigger |
| 6 | Dois refresh concorrentes com o mesmo token | **Dois 200** — sem rotação, refresh não muda estado (ADR-11); provado na [02.02](sprint-02.02-rotas-protegidas.md) | **Não repetir** |
| 7 | Retry de `POST /appointments` | **409 determinístico** pela chave natural `(doctor_id, scheduled_at)`. Com a decisão 15, este **é** o comportamento de retry do sistema — seguro (nunca duplica), sem replay | README (DEBT-05) |
| 8 | Retry de `POST /patients` idêntico | **Duas linhas** — `patients` não tem unicidade natural. É exatamente o que DEBT-05 declara | README (DEBT-05) |
| 9 | `load.seed.ts` contra `prontomed_test` | Atropelaria a suíte e2e | Guarda `NODE_ENV=test` no seed |
| 10 | Carga durante `npm run test:e2e` | Bancos diferentes, mas medir com a suíte parada evita ruído de CPU no p99 | Documentar no README |
| 11 | Run anterior abortado deixou o slot ocupado | `created_201` daria 0 e o threshold reprovaria um sistema correto | `setup()` limpa o slot (decisão 19) |

<!-- /§edge-cases -->

---

<!-- §checklist -->

## Checklist anti-erro (pré-fechamento)

**Verde**
- [x] `npm run lint && npm run typecheck && npm run build && npm test && npm run test:e2e` — todos verdes (**133** unitários / 21 suítes · **153** e2e / 10 suítes), rodados de novo **depois** das correções da fricção PÓS
- [x] `npm run test:stress` rodado **3 vezes seguidas** com o mesmo resultado — mais uma 4ª após restaurar o índice da execução B e uma 5ª após as correções da PÓS: `count=1` / `count=19` / `rate=100.00%` nas cinco

**A prova em si**
- [x] **Execução B executada** e a saída colada em §issues: com o índice removido, o overbooking **acontece** (`created_201 count=12`)
- [x] Se a execução B produzir `1× 201`, **issue aberta** — não se aplicou: deu 12
- [x] Passo 3 da execução B (limpeza) executado antes de recriar o índice — devolveu `UPDATE 0` porque o `teardown()` já limpara (issue 2); índice recriado e conferido por `\di` **e** por `pg_indexes.indexdef`, idêntico ao da migration
- [x] `teardown()` conta **exatamente uma** linha viva e a cancela
- [x] O 409 é o **humano do catálogo** (`SCHEDULE_CONFLICT`), não `QueryFailedError` vazando como 500 — check dedicado, 100% verde
- [x] `http_req_failed` **não** conta 409 como falha — `http.setResponseCallback` em **init context**; `http_req_failed 0.00% out of 15703`
- [x] Cenário **não é lido em lugar nenhum**: cada um tem `exec:` própria, e o footgun do `__scenario` deixa de existir em vez de ser evitado com cuidado (Q-PÓS-2)
- [x] p95 **e** p99 no sumário (`summaryTrendStats`), quebrados por endpoint

**Higiene**
- [x] Nenhum `sleep`, nenhuma dependência de ordem, nenhuma data derivada do relógio (`STRESS_SLOT` constante literal em 2099)
- [x] `load.seed.ts` recusa `NODE_ENV=test` **e** `APP_ENV != dev`, e é idempotente por existência — com aviso quando o volume está incompleto (B-PÓS-1)
- [x] **Nenhuma dependência nova no `package.json`** — k6 é imagem Docker (decisão 3)
- [x] **Nenhuma migration, nenhuma mudança de schema** (decisão 15); nenhuma mudança em `src/` fora do seed novo
- [x] `k6` **sobe em `docker compose up -d`** e fica ocioso, sem disparar teste nenhum no boot (decisão 21) — verificado: três containers `Up`, e `npm run test:stress` verde em seguida por `docker exec`
- [x] `npm run test:stress` é **comando único** — seed resolvido internamente (decisão 17), 2ª execução em < 1 s
- [x] Números da carga registrados em §issues **com o volume que os produziu**
- [x] Scores ≥ 9/10 na fricção PÓS (`[Backend]` 9 · `[QA]` 9); zero CRÍTICO e zero ALTO; os dois MÉDIOs corrigidos antes de fechar

**Docs**
- [x] Os 9 itens da tabela do **passo 7** do §escopo, um a um — mais `PLAN.md §14.1` e `§14.2`, que **não estavam na lista fechada** e teriam ficado em drift: §14.2 se declara espelho do `package.json` e não citava os dois scripts novos (nem `migration:run:test`, que já faltava); §14.1 não citava o serviço `k6`

<!-- /§checklist -->

---

<!-- §scores -->

## Scores de fricção

| Agente | Fase | Score | Severidade máxima | Observação |
| --- | --- | --- | --- | --- |
| `[Database]` | PRÉ | **9**/10 | ALTO (2) | Sobre o desenho **com** idempotência. D1–D4 sem objeto após a decisão 15 — nenhuma tabela nova existe. D1 segue citado na decisão 15 como parte do rationale |
| `[Backend]` | PRÉ | **9**/10 | ALTO (1) | B1–B3 eram sobre o interceptor — sem objeto após a decisão 15 |
| `[Produto]` | PRÉ | **9**/10 | ALTO (1) | P1–P3 eram sobre o header — sem objeto. `[Produto]` **sai da PÓS**: nenhum contrato HTTP muda |
| `[QA]` | PRÉ | **9**/10 | ALTO (2) | **Q1 e Q3 sobrevivem ao corte** e estão incorporados (execução B; contadores sem ordem). Q2 morre com o spec que não existirá; Q4 incorporado no seed |
| `[Backend]` | PÓS | **9**/10 | MÉDIO (1) | B-PÓS-1 corrigido antes de fechar. Zero CRÍTICO, zero ALTO |
| `[QA]` | PÓS | **9**/10 | MÉDIO (1) | Q-PÓS-1 corrigido antes de fechar. Zero CRÍTICO, zero ALTO |

### Achados da fricção PÓS — 10/08/2026

| ID | Agente | Sev | Achado | Resolução |
| --- | --- | --- | --- | --- |
| **B-PÓS-1** | `[Backend]` | **MÉDIO** | A guarda de idempotência do `load.seed.ts` é a **existência do médico**, e o médico nasce **antes** do volume. Uma execução interrompida no meio do lote deixaria o banco com volume parcial, e a execução seguinte diria "já existia; nada inserido" — estado quebrado **em silêncio**, com o k6 depois falhando por um motivo que não aponta para o seed | **Corrigido.** O caminho idempotente passou a conferir `countBy({ doctorId })` contra `LOAD_PATIENT_COUNT` e emitir `warn` com a instrução de recomeço. Não conserta sozinho de propósito: apagar linha por conta própria é decisão que o script não deve tomar. **Verificado empiricamente** — sonda de 1 paciente inserida, `Volume incompleto: 501 pacientes onde o esperado é 500`, sonda removida, estado restaurado (503 linhas) |
| **Q-PÓS-1** | `[QA]` | **MÉDIO** | O `setup()` limpa o slot filtrando por `status=SCHEDULED`, e é o único estado que o `DELETE` cancela. Uma consulta **COMPLETED** no mesmo horário também ocupa o índice parcial e é **terminal** — nada no sistema a libera. O sintoma seria `created_201 count=0` e um threshold reprovando um sistema **correto**: a pior mensagem de erro possível | **Corrigido.** Depois da limpeza, o `setup()` relê o slot **sem filtro de status** e aborta com mensagem nomeada se sobrar qualquer linha não cancelada |
| B-PÓS-2 | `[Backend]` | BAIXO | `stress-test.js` não passa por `lint` nem por `typecheck` — o `eslint` cobre `{src,test}/**/*.ts` e o `tsc` ignora `.js` sem `allowJs` | **Aceito, declarado.** O k6 roda num runtime Go próprio, não em Node: TypeScript exigiria etapa de build para um arquivo que a imagem consome cru. O que substitui o typecheck é a própria execução — script quebrado não produz sumário |
| Q-PÓS-2 | `[QA]` | BAIXO | O contrato mandava ler o cenário por `exec.scenario.name`; a implementação **não lê cenário nenhum** | **Aceito — atende a intenção por caminho melhor.** Cada cenário tem `exec:` própria (`overbooking` / `load`), então o `if` sobre nome de cenário — que era o footgun (`__scenario` indefinido → nenhuma requisição sai → `checks 100% ✓ 0 of 0`) — deixa de existir em vez de ser feito com cuidado |
| Q-PÓS-3 | `[QA]` | BAIXO | A contagem do `teardown()` lê pela API, paginada em `perPage=100` | **Aceito.** O teto do cenário é 20 VUs; 100 é 5× a pior hipótese, e a execução B (que produz 20 linhas vivas de propósito) cabe |

### Achados da fricção PRÉ — 10/08/2026 (registro histórico)

Zero CRÍTICO, seis ALTOs, todos resolvidos **no desenho da época** (que incluía a
idempotência). A coluna "Hoje" diz o que cada um virou depois da decisão 15.
Sobrevivem: **Q1** (→ execução B), **Q3** (asserção por contador), **Q4** (seed
guardado). D1 segue citado na decisão 15 como parte do rationale do corte.

| ID | Agente | Sev | Achado | Hoje |
| --- | --- | --- | --- | --- |
| D1 | `[Database]` | ALTO | `response_body` de `POST /patients` criaria segunda cópia de PII fora do alcance de `AnonymizePatientService`; limpar por dentro tocaria dois agregados (ADR-04 proíbe) | Sem objeto (tabela não existe) — mas é parte do porquê do corte ser barato: o risco de PII desaparece inteiro |
| D2 | `[Database]` | ALTO | `UNIQUE` sem invariante nomeada violaria `review-database.md:98` | Sem objeto — nenhuma UNIQUE nova |
| D3 | `[Database]` | MÉDIO | Tabela de chaves só cresceria sem scheduler | Sem objeto |
| D4 | `[Database]` | BAIXO | `varchar(255)` seria limite inventado | Sem objeto |
| B1 | `[Backend]` | ALTO | Interceptor em `gateways/http` tocando `DataSource` furaria a regra de dependência | Sem objeto — interceptor não existe |
| B2 | `[Backend]` | MÉDIO | `APP_INTERCEPTOR` global aplicaria a 17 rotas para servir a 1 | Sem objeto |
| B3 | `[Backend]` | BAIXO | Porta em `domains/domain/repositories/` sugeriria agregado | Sem objeto |
| P1 | `[Produto]` | ALTO | Sem sinal de replay, `double_click` seria indistinguível de 3 criações | Sem objeto — cenário cortado |
| P2 | `[Produto]` | MÉDIO | `code` novo precisaria entrar no tipo fechado | Sem objeto |
| P3 | `[Produto]` | MÉDIO | Swagger sem o header | Sem objeto |
| **Q1** | `[QA]` | **ALTO** | k6 não distingue "índice fechou a corrida" de "pré-SELECT pegou por escalonamento" | **Vivo — é a execução B** (decisão 13 + limpeza da decisão 20) |
| Q2 | `[QA]` | ALTO | Docs cobrariam um spec que não existiria (decisão 8) | Incorporado na cascata do passo 7 |
| **Q3** | `[QA]` | MÉDIO | `startTime` escalonado não garante simultaneidade; `sleep` é proibição ALTA | **Vivo** — 20 VUs em `shared-iterations`, asserção por contador |
| **Q4** | `[QA]` | MÉDIO | `load.seed.ts` escreve no banco de desenvolvimento | **Vivo** — médico próprio + guarda `NODE_ENV=test`; contido por INV-04 |

### Achados da re-crítica — 10/08/2026 (sessão de releitura)

| ID | Sev | Achado | Efeito |
| --- | --- | --- | --- |
| C1 | ALTO | Record-after-success perde a corrida da própria chave: `double_click` com 20 VUs simultâneos daria `1× 201 + 19× 409`, não `20× 201` — indistinguível do overbooking | Motivou o rebaixamento para sequencial e, com a releitura do PDF, a **decisão 15** (corte). Sem objeto no escopo final |
| C2 | ALTO | Procedimento anti-falso-verde recriava o índice único **sobre as duplicatas que o próprio teste criou** — falha determinística, banco ficaria sem a defesa da INV-01 | **Decisão 20** — passo de limpeza obrigatório |
| C3 | MÉDIO | Snippet do k6 misturava `http.setResponseCallback` (init context) com chaves de `options` — copiado literal, o k6 ignora o callback e o sumário mente | §contrato.k6 reescrito com os dois blocos separados |
| C4 | MÉDIO | Edge sobre TTL prometia "cria recurso novo" onde a chave natural devolve 409 | Sem objeto (decisão 15) |

**Verificações empíricas** (`CLAUDE.md §Validação empírica`):

| Afirmação | Como foi verificada |
| --- | --- |
| Índice único parcial de INV-01 já existe | `migrations/1786310600161-sprint04.01-appointments.ts:41` |
| `23505` → 409 já é traduzido | `framework/filters/errors/exception-filter.ts:110-150` |
| Pré-SELECT no caso de uso existe e é deliberado | `services/appointments/schedule-appointment.service.ts:80-93` |
| Pool do app é 10, não 1 | `docker exec api-prontomed` → `node_modules/pg-pool/index.js:89`; `database.providers.ts` sem `extra` |
| Listagem filtra por período e status (teardown/setup dependem) | `gateways/http/schemas/domain/appointment.schema.ts:75-78` (`from`/`to`/`status`) |
| Prefixo global é `api` | `src/app.setup.ts:15` |
| `node_modules` não existe no host; scripts rodam via `docker exec` | `README.md` §Testes, nota *"Por que `docker exec` em vez de `npm test` direto"* — é o que exige o desenho da decisão 17 |
| O PDF não pede idempotência nem performance | Releitura integral em 10/08/2026 — RFs, RNFs e itens de avaliação; a base da decisão 15 |

<!-- /§scores -->

---

<!-- §issues -->

## Issues encontrados durante a implementação

| # | Issue | Causa | Resolução | Arquivos | Débito |
| --- | --- | --- | --- | --- | --- |
| 1 | O stack Docker de pé **não era este repositório**: `api-prontomed` estava montado em `/tmp/.../scratchpad/desafio-backend-afya/api` | Clone de sessão anterior (validação do roteiro do README a partir de estado limpo) deixado rodando; `docker exec api-prontomed` alcançava a árvore errada — `npm run seed:load` respondeu `Missing script` com o script já no `package.json` do repo | `docker compose -p desafio-backend-afya down` + `up -d --build` a partir da raiz do projeto. Volume novo (`prontomed-api_pgdata`), `migration:run` nos dois bancos e `seed` refeitos. **Descoberto por `docker inspect --format '{{json .Mounts}}'`, não por suposição** | — | Não |
| 2 | Passo 3 da execução B (limpeza antes do `CREATE INDEX`) devolveu `UPDATE 0` | O `teardown()` do k6 **já havia cancelado** as 12 linhas vivas — ele cancela tudo o que a listagem do slot devolver, não só a primeira | Passo mantido no procedimento. Ele deixa de ser redundante exatamente no caso que importa: k6 abortado (`exec.test.abort`, threshold de `setup`, Ctrl+C) não roda `teardown()`, e aí as linhas ficam | `sprint-06.01` §escopo | Não |
| 3 | §contrato.k6 pedia p95/p99 por endpoint **"via `tags`"**; tag sozinha não imprime nada | No k6, sub-métrico (`http_req_duration{endpoint:x}`) só aparece no sumário se houver **threshold** declarado sobre ele | Tags **mais** threshold no-op `p(99)>=0` — sempre verdadeiro, existe só para materializar a linha no sumário. O comentário no arquivo diz isso com essas palavras, para ninguém ler como meta de performance que nenhum RNF pede | `stress-test.js` | Não |
| 4 | A execução B mostrou que o pré-SELECT do caso de uso pega **8 de 20** | `schedule-appointment.service.ts` consulta antes de gravar; sob 20 VUs simultâneos, parte das requisições ainda vê o slot livre | Nada a corrigir — é o número que **quantifica** por que o índice é a defesa real: sem ele, 12 overbookings passariam. O pré-SELECT é conveniência de mensagem, não integridade | — | Não |
| 5 | A credencial do médico de estresse é literal **duplicada** em dois arquivos | O k6 precisa fazer login e o seed precisa criar o médico; sem uma terceira variável de ambiente, os dois lados só concordam pelo literal | Aceito, com comentário cruzado nos dois arquivos. É fixture, não segredo: o que fecha a porta é a guarda `APP_ENV=dev` do seed, não o valor da senha | `load.seed.ts` · `stress-test.js` | Não |

### Execução A — `npm run test:stress` (índice presente, 3× seguidas)

| Cenário | VUs | Resultado esperado | Resultado obtido |
| --- | --- | --- | --- |
| `overbooking` | 20 | `1× 201` · `19× 409 SCHEDULE_CONFLICT` · 1 linha viva, cancelada no teardown | ✅ **idêntico nas 3 execuções**: `created_201{scenario:overbooking} count=1` · `conflict_409{scenario:overbooking} count=19` · `checks rate=100.00%` (15.719 / 16.685 / 16.841 checks) · `http_req_failed 0.00%` · teardown confirmou **1** linha viva e a cancelou |

Uma quarta execução, depois da restauração do índice da execução B, repetiu o mesmo
resultado (`count=1` / `count=19` / `rate=100.00%`) — é a confirmação de que o banco
voltou ao estado correto.

### Execução B — prova anti-falso-verde (índice removido)

**Sem esta linha preenchida, a sprint não fecha.**

| Resultado esperado | Resultado obtido | Veredito |
| --- | --- | --- |
| **vários 201** — o overbooking acontece | **`created_201 count=12`** · `conflict_409 count=8` · `checks rate=99.99%` (o único check que falhou é o do teardown: 12 linhas vivas onde a invariante exige 1) · k6 saiu com código 99 | ☑️ **prova válida** / ⬜ falso-verde → issue |

O que a execução B prova, com número: **o índice único parcial é a defesa; o
pré-SELECT do caso de uso não é.** Ele barrou 8 das 20 requisições — as que chegaram
depois de alguém já ter gravado — e deixou passar 12. A tradução `23505 → 409
SCHEDULE_CONFLICT` do `exception-filter.ts:110-118` foi exercitada de verdade pela
primeira vez na execução A, e é o que faz o conflito chegar ao cliente como regra de
negócio em vez de 500.

Restauração conferida: `\di uk_appointments_doctor_slot` e `pg_indexes.indexdef` batem
literalmente com `migrations/1786310600161-sprint04.01-appointments.ts:41`.

### Medições de carga

**Registrar com o volume que produziu o número** — número sem volume não é medida.

Volume: **500 pacientes + 2.000 consultas + 667 anotações** do médico de estresse
(`LOAD_PATIENT_COUNT` / `LOAD_APPOINTMENT_COUNT`), sobre 503 pacientes e 2.003
consultas no banco. Carga: 5 VUs constantes por 30 s, **4 execuções** (o mínimo e o
máximo das quatro, sem descartar nenhuma); vazão de 283 req/s medida na primeira.
Ambiente: **Docker sobre WSL2, mesma máquina do cliente e do banco, máquina ociosa** —
a condição importa, e o parágrafo depois da tabela mostra por quê.

> **A tabela `appointments` cresce 1 linha por execução, e é esperado.** O
> `teardown()` **cancela** a consulta vencedora em vez de apagá-la — a API não tem
> delete, e cancelar é o que devolve o horário ao índice parcial (decisão 19). Depois
> de 22 execuções desta sprint o médico de estresse tinha 2.022 consultas, sendo
> **22 canceladas no `STRESS_SLOT`** (verificado por `psql`). Elas não entram no
> índice único, não aparecem em listagem por período fora daquele instante e não
> mudam a medição de forma perceptível — 1% depois de 22 rodadas. Quem quiser o
> volume exato do seed recomeça com `docker compose down -v`.

| Cenário | Volume | p95 | p99 | Débito aberto? |
| --- | --- | --- | --- | --- |
| Listagem de pacientes (`ILIKE`, sem índice de texto) | 500 pacientes | 11,65 – 13,07 ms | 15,68 – 16,94 ms | **Não** — dentro da faixa das outras duas |
| Linha do tempo do paciente | 4 consultas/paciente, `JOIN` com anotações | 15,19 – 17,45 ms | 19,91 – 22,71 ms | **Não** — é a rota mais cara, e por motivo conhecido (`JOIN`) |
| Listagem da agenda | 2.000 consultas, `OFFSET` variando entre as páginas 1 e 10 | 11,32 – 12,70 ms | 14,54 – 16,94 ms | **Não** — DEBT-09 (`OFFSET`) **segue aberto sem número que o justifique** |

**Nenhum débito de performance foi aberto, e isso é a conclusão — não a ausência de
uma.** Os três candidatos nomeados na decisão 7 (`ILIKE` sem índice de texto,
`OFFSET`) foram medidos e nenhum destoa: a diferença entre a rota mais barata e a
mais cara é o `JOIN` da linha do tempo, não a varredura de texto nem o deslocamento
de página. Abrir débito aqui seria débito sem número, que é exatamente o que a
decisão 7 proíbe.

**O milissegundo não transfere, e a própria medição prova isso.** Depois da decisão
21 (k6 acionado por `docker exec` em vez de container efêmero), as execuções foram
repetidas com a máquina ocupada por outro trabalho. A vazão caiu de **283** para
**194 req/s** e o p95 subiu para **30–45 ms** nas três rotas — até voltar a
**242 req/s** e **17–23 ms** na execução seguinte. Mesma máquina, mesmo código, mesmo
volume: **2,5× de diferença conforme o que mais está rodando.**

| Execução | Vazão | p95 busca | p95 timeline | p95 agenda |
| --- | --- | --- | --- | --- |
| máquina ociosa (4×, publicadas acima) | 283 req/s | 11,7 – 13,1 ms | 15,2 – 17,5 ms | 11,3 – 12,7 ms |
| máquina ocupada | 194 req/s | 30,6 ms | 40,9 ms | 30,3 ms |
| máquina intermediária | 242 req/s | 17,5 ms | 23,3 ms | 17,8 ms |

**A variação não é ruído a esconder — é o argumento.** Vender o número absoluto de
uma execução escolhida seria o amadorismo que o §riscos nomeia; publicar a faixa com
a condição que a produziu é o oposto disso. A tabela principal fica com os números de
**máquina ociosa**, rotulados como tal.

O que sobrevive às sete execuções é uma coisa só, e é a que vale: a **ordem relativa**
das três rotas — timeline > busca ≈ agenda, sem exceção. É ela que sustenta a
conclusão de que nenhum candidato de otimização destoa, porque a rota mais cara é a
que faz `JOIN`, não a que varre texto nem a que desloca página.

**A cauda, ao contrário, não é constante — e a correção disto é um erro meu, pego na
conferência de 10/08/2026.** O texto original afirmava "p99 ≈ 1,4× p95" como se fosse
invariante. Os números medidos dizem outra coisa:

| Condição | p99 / p95 |
| --- | --- |
| máquina ociosa (4 execuções × 3 rotas) | **1,28 – 1,37×** |
| máquina sob contenção (3 execuções × 3 rotas) | **1,36 – 2,14×** |

Ou seja: com a máquina livre a cauda é curta e previsível (~1,3×); sob disputa de CPU
ela **estica até dobrar**. Isso é comportamento de fila, não do código — e é mais um
motivo para o número absoluto não viajar. Afirmar 1,4× fixo era generalizar de uma
amostra silenciosa.

<!-- /§issues -->

---

<!-- §riscos -->

## Riscos e mitigações

| Risco | Impacto | Mitigação | Gatilho de reabertura |
| --- | --- | --- | --- |
| **k6 verde sem nunca ter havido corrida** | Falso-verde permanente — pior que a ausência declarada de hoje | **Execução B** · 3 execuções seguidas · asserção por contador, nunca por ordem | Qualquer intermitência |
| **A prova vive fora da suíte automatizada** | `test:e2e` não prova INV-01 sob corrida; nada roda a prova sozinho (RNF-12 cortado) | Preço declarado em §objetivo, no README e em `PLAN.md §12.4` — demonstração, não regressão, dito com essas palavras | Alguém tratar `test:e2e` verde como prova de concorrência |
| **Número lido como absoluto** | p95 em Docker/WSL2 não transfere; vendê-lo como performance seria amadorismo | README vende **metodologia e débito quantificado**, nunca o milissegundo | — |
| Carga vira sprint de otimização | O prisma corta: nenhum RNF pede performance | **Decisão 7** — medir e registrar; consertar é outra decisão, com o número na mão | Número que inviabilize o roteiro do README |
| Avaliador estranhar a ausência de idempotência | Menor: nada no PDF a pede | Rationale de uma linha no README junto a DEBT-05 — julgamento de escopo declarado é item avaliado | — |

<!-- /§riscos -->
