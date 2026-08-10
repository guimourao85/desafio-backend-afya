import exec from 'k6/execution';
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

/**
 * A prova sob estresse do ProntoMed (sprint 06.01).
 *
 * Dois cenários, dois propósitos que não se misturam:
 *
 * 1. `overbooking` — 20 requisições **simultâneas** no mesmo horário do mesmo
 *    médico. O sistema tem de produzir exatamente `1× 201` e `19× 409`, e o 409 tem
 *    de ser o humano do catálogo (`SCHEDULE_CONFLICT`), não um 500 de
 *    `QueryFailedError` vazando. É a única corrida do sistema que corrompe dado de
 *    verdade (INV-01).
 * 2. `load` — as três leituras paginadas sob concorrência sustentada, para **medir**
 *    p95 e p99. Nenhum requisito pede performance: aqui não se persegue meta, se
 *    registra número com o volume que o produziu.
 *
 * **Isto é demonstração, não regressão.** Roda por `npm run test:stress`, nunca por
 * `npm run test:e2e`, e nada o dispara sozinho — o preço está declarado no README e
 * em `PLAN.md §12.4`.
 *
 * **O que este arquivo sozinho NÃO prova:** que foi o índice único que fechou a
 * corrida. Se os VUs serializarem, o pré-SELECT de `schedule-appointment.service.ts`
 * pega o conflito antes do banco e a saída é idêntica. Quem separa os dois casos é a
 * **execução B** do sprint-doc (rodar uma vez com o índice removido e ver o
 * overbooking acontecer).
 */

const API = __ENV.API_URL || 'http://api:3333/api';

/**
 * A credencial do médico de estresse. **Fixture, não segredo** — o par idêntico vive
 * em `src/infrastructure/databases/typeorm/postgres/seeds/load.seed.ts`, que é quem
 * cria este médico e recusa rodar fora de `APP_ENV=dev`. Mexeu num, mexa no outro.
 */
const STRESS_DOCTOR = {
  email: 'k6.stress@prontomed.dev',
  password: 'k6-stress-prontomed',
};

/**
 * O horário disputado. **Constante literal, jamais derivada do relógio**
 * (`review-testing.md`): slot que muda a cada execução é data incontrolada, e o
 * `setup()` não teria o que limpar de forma determinística.
 *
 * 2099 porque precisa nascer vazio: o `load.seed.ts` popula a agenda de 2027, e o
 * seed de demonstração vai até 2027 também. Nenhum dos dois encosta aqui.
 */
const STRESS_SLOT = '2099-06-15T12:00:00.000Z';

/** 20 VUs disputando um horário. Menos que isso e a chance de serialização sobe. */
const CONCURRENT_VUS = 20;

/**
 * Termos de busca que existem no volume do `load.seed.ts` — nomes montados de
 * `FIRST_NAMES` × `LAST_NAMES`. Buscar por string que não casa com nada mediria o
 * custo de um `ILIKE` que não devolve linha, que é o caso barato e não o interessante.
 */
const SEARCH_TERMS = ['Ana', 'Ribeiro', 'Mar', 'Silva', 'Teixeira', 'Lu', 'Gonçalves', 'Sé'];

const created201 = new Counter('created_201');
const conflict409 = new Counter('conflict_409');

/**
 * **INIT CONTEXT — chamada de função, fora do objeto `options`.** Misturar as duas
 * coisas faz o k6 ignorar o callback com um warning fácil de perder, e o sumário
 * abre em ~95% de `http_req_failed` (achado C3 da re-crítica).
 *
 * O que ela diz: no cenário `overbooking`, 409 é o resultado **esperado** de 19 das
 * 20 requisições. Sem isto, o sucesso do teste seria reportado como falha de rede.
 */
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 409));

export const options = {
  // p95 **e** p99: a cauda é o que a medição procura, e a média esconde exatamente
  // ela. `max` fica junto para que um outlier solitário seja visível como outlier.
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],

  thresholds: {
    // A asserção da sprint, sobre o **conjunto** e nunca sobre a ordem: afirmar qual
    // requisição chegou primeiro é afirmar o que o Postgres não promete.
    'created_201{scenario:overbooking}': ['count == 1'],
    'conflict_409{scenario:overbooking}': [`count == ${CONCURRENT_VUS - 1}`],
    checks: ['rate == 1.00'],

    // Estes três não são meta — são **dispositivo de impressão**. Um sub-métrico só
    // aparece no sumário se houver threshold sobre ele, e `p(99)>=0` é sempre
    // verdadeiro. É assim que p95/p99 saem quebrados por endpoint sem que o teste
    // finja perseguir um número que nenhum RNF pede (`PLAN.md §3.1`).
    'http_req_duration{endpoint:patients_search}': ['p(99)>=0'],
    'http_req_duration{endpoint:patient_timeline}': ['p(99)>=0'],
    'http_req_duration{endpoint:appointments_list}': ['p(99)>=0'],
  },

  scenarios: {
    overbooking: {
      // `shared-iterations` com iterações == VUs: os 20 sobem juntos e cada um pega
      // exatamente uma iteração. `startTime` escalonado ou `sleep` destruiriam a
      // simultaneidade, que é a única coisa que este cenário mede.
      executor: 'shared-iterations',
      exec: 'overbooking',
      vus: CONCURRENT_VUS,
      iterations: CONCURRENT_VUS,
      maxDuration: '30s',
    },
    load: {
      // Começa depois do overbooking: medir latência enquanto 20 VUs disputam uma
      // linha mediria a disputa, não a leitura.
      executor: 'constant-vus',
      exec: 'load',
      vus: 5,
      duration: '30s',
      startTime: '30s',
    },
  },
};

/**
 * Roda **uma vez**, antes de todos os VUs, e o que devolve alimenta cada iteração.
 *
 * Faz três coisas: abre a sessão, descobre os pacientes do volume e **limpa o slot
 * de estresse**. A limpeza é o que torna a re-execução determinística (edge 11): um
 * run anterior abortado deixaria o horário ocupado, `created_201` daria 0 e o
 * threshold reprovaria um sistema correto.
 */
export function setup() {
  const login = http.post(`${API}/auth/login`, JSON.stringify(STRESS_DOCTOR), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (login.status !== 200) {
    // Aborta com a causa provável em vez de deixar 20 VUs baterem em 401: sem o
    // seed de carga, este login não existe.
    exec.test.abort(
      `Login do médico de estresse falhou (${login.status}). Rode \`npm run test:stress\`, que resolve o seed antes.`,
    );
  }

  const headers = authHeaders(login.json('accessToken'));

  const patients = http.get(`${API}/patients?perPage=100`, { headers });
  const patientIds = patients.json('data').map((patient) => patient.id);

  if (patientIds.length < CONCURRENT_VUS) {
    exec.test.abort(
      `O volume tem ${patientIds.length} pacientes e o cenário precisa de ${CONCURRENT_VUS}. O seed de carga rodou?`,
    );
  }

  for (const appointment of liveAtStressSlot(headers)) {
    http.del(`${API}/appointments/${appointment.id}`, null, { headers });
  }

  // A limpeza acima só alcança o que está `SCHEDULED` — é o único estado que o
  // `DELETE` aceita cancelar. Uma consulta **concluída** no mesmo horário também
  // ocupa o índice parcial (`WHERE status <> 'CANCELLED'`) e é terminal: nada no
  // sistema a libera. Sem esta verificação, o sintoma seria `created_201 count=0` e
  // um threshold reprovando um sistema **correto** — a pior mensagem de erro
  // possível. Com ela, o teste para dizendo exatamente o que houve.
  const blocking = occupyingStressSlot(headers).filter((a) => a.status !== 'CANCELLED');

  if (blocking.length > 0) {
    exec.test.abort(
      `O horário de estresse (${STRESS_SLOT}) está ocupado por ${blocking.length} consulta(s) em estado terminal, que o cancelamento não libera. Limpe-as no banco antes de repetir.`,
    );
  }

  return { token: login.json('accessToken'), patientIds: patientIds.slice(0, CONCURRENT_VUS) };
}

/**
 * Uma requisição por VU, todas no **mesmo** horário e cada uma com um paciente
 * **diferente** — sem isso, o 409 poderia vir de qualquer outra regra em vez do
 * conflito de agenda.
 *
 * O índice sai de `exec.scenario.iterationInTest`, que é único por iteração no
 * cenário inteiro. `__VU` não serve: com `shared-iterations` não há garantia de que
 * cada VU pegue exatamente uma iteração.
 */
export function overbooking(data) {
  const patientId = data.patientIds[exec.scenario.iterationInTest % data.patientIds.length];

  const response = http.post(
    `${API}/appointments`,
    JSON.stringify({ patientId, scheduledAt: STRESS_SLOT }),
    { headers: authHeaders(data.token), tags: { endpoint: 'schedule' } },
  );

  if (response.status === 201) created201.add(1);
  if (response.status === 409) conflict409.add(1);

  check(response, {
    'overbooking: a resposta é 201 ou 409 — nunca 500': (r) => r.status === 201 || r.status === 409,
    // O que separa "invariante defendida" de "erro de banco vazando": o corpo do 409
    // tem de ser o do catálogo, traduzido por `exception-filter.ts`.
    'overbooking: o 409 traz code SCHEDULE_CONFLICT': (r) =>
      r.status !== 409 || r.json('code') === 'SCHEDULE_CONFLICT',
  });
}

/**
 * As três leituras paginadas, sob concorrência sustentada. Cada uma leva a `tag` que
 * a separa no sumário.
 *
 * `page` varia de propósito: `OFFSET` fica mais caro à medida que a página avança
 * (DEBT-09), e medir só a página 1 esconderia justamente isso.
 */
export function load(data) {
  const headers = authHeaders(data.token);
  const iteration = exec.scenario.iterationInTest;

  const term = SEARCH_TERMS[iteration % SEARCH_TERMS.length];
  const patientId = data.patientIds[iteration % data.patientIds.length];
  const page = (iteration % 10) + 1;

  const search = http.get(`${API}/patients?search=${encodeURIComponent(term)}&perPage=20`, {
    headers,
    tags: { endpoint: 'patients_search' },
  });

  const timeline = http.get(`${API}/patients/${patientId}/appointments?perPage=20`, {
    headers,
    tags: { endpoint: 'patient_timeline' },
  });

  const agenda = http.get(`${API}/appointments?page=${page}&perPage=20`, {
    headers,
    tags: { endpoint: 'appointments_list' },
  });

  check(search, { 'carga: busca de pacientes responde 200': (r) => r.status === 200 });
  check(timeline, { 'carga: linha do tempo responde 200': (r) => r.status === 200 });
  check(agenda, { 'carga: listagem da agenda responde 200': (r) => r.status === 200 });
}

/**
 * Fecha a prova **no banco**, não na saída HTTP: o status prova que o erro foi
 * traduzido; a contagem prova a invariante. Exatamente **uma** linha viva no horário
 * disputado, e nenhuma outra.
 *
 * Depois cancela essa linha. O índice de INV-01 é parcial (`WHERE status <>
 * 'CANCELLED'`), então cancelar devolve o horário — é o que faz três execuções
 * seguidas darem o mesmo resultado sem intervenção manual, e de quebra exercita a
 * semântica que o edge 3 documenta.
 */
export function teardown(data) {
  const headers = authHeaders(data.token);
  const live = liveAtStressSlot(headers);

  check(live, {
    'teardown: exatamente uma consulta viva no horário disputado': (rows) => rows.length === 1,
  });

  for (const appointment of live) {
    http.del(`${API}/appointments/${appointment.id}`, null, { headers });
  }
}

/** As consultas ainda agendadas no horário de estresse — no máximo uma, se tudo deu certo. */
function liveAtStressSlot(headers) {
  return stressSlotAppointments(headers, '&status=SCHEDULED');
}

/** Tudo o que existe naquele horário, cancelado inclusive — a leitura de diagnóstico. */
function occupyingStressSlot(headers) {
  return stressSlotAppointments(headers, '');
}

/**
 * `perPage=100` e não o default de 20: na execução B (índice removido) o horário
 * chega a ter 20 linhas vivas de propósito, e paginar aqui faria a limpeza deixar
 * resto para trás sem dizer nada.
 */
function stressSlotAppointments(headers, statusFilter) {
  const response = http.get(
    `${API}/appointments?from=${STRESS_SLOT}&to=${STRESS_SLOT}${statusFilter}&perPage=100`,
    { headers },
  );

  return response.json('data');
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
