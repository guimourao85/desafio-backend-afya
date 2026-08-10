/**
 * Roteiro de avaliação do README, executado por máquina.
 *
 * POR QUE ISTO EXISTE — o README promete um roteiro de 10 passos que qualquer
 * avaliador segue pelo Swagger. Promessa de documentação só vale se alguém a
 * exercita literalmente; este script é esse alguém. Ele NÃO bate na API por HTTP
 * (disso a suíte e2e já cuida): abre o Swagger num Chromium real e faz o que um
 * humano faria — expandir a rota, Try it out, aceitar ou editar o exemplo,
 * Execute, ler o status na própria UI. O que só existe nessa camada (exemplo
 * pré-preenchido, Authorize, cadeado) só é provado por aqui — foi assim que as
 * issues 8 e 9 da sprint 05.02 apareceram, invisíveis para o e2e.
 *
 * O QUE ELE ASSERE — cada passo do roteiro vira uma ou mais verificações
 * (18 no total): o status que o README promete, o exemplo que deve vir
 * preenchido, o efeito que o passo seguinte depende (slot devolvido, histórico
 * intacto, PII apagada). Divergiu do README → FAIL, e quem se corrige é o
 * README ou a API, nunca a asserção.
 *
 * PRÉ-CONDIÇÃO — ambiente de pé com seed aplicado (passos 1–7 do README).
 * O script cria dados próprios; para re-rodar, recrie a base (ver README aqui
 * do lado).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DOCS = 'http://localhost:3333/api/docs';
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

// IDs dos opblocks no DOM do Swagger UI: `operations-<tag>-<operationId>`.
// As tags vêm com acento (autenticação) — o id do elemento preserva o unicode.
const OP = {
  login: 'operations-autenticação-AuthenticateDoctorController_handle',
  me: 'operations-autenticação-GetProfileController_handle',
  createPatient: 'operations-pacientes-RegisterPatientController_handle',
  listPatients: 'operations-pacientes-ListPatientsController_handle',
  schedule: 'operations-agendamentos-ScheduleAppointmentController_handle',
  cancel: 'operations-agendamentos-CancelAppointmentController_handle',
  addNote: 'operations-agendamentos-AddConsultationNoteController_handle',
  timeline: 'operations-pacientes-GetPatientTimelineController_handle',
  anonymize: 'operations-pacientes-AnonymizePatientController_handle',
  getPatient: 'operations-pacientes-GetPatientController_handle',
};

const results = [];
let shotIdx = 0;

function report(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${step} | ${detail}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  page.setDefaultTimeout(20000);

  const block = (id) => page.locator(`[id="${id}"]`);

  async function expand(id) {
    const b = block(id);
    await b.scrollIntoViewIfNeeded();
    const open = await b.evaluate((el) => el.classList.contains('is-open'));
    if (!open) await b.locator('.opblock-summary').click();
    await b.locator('.opblock-body').waitFor();
  }

  async function tryOut(id) {
    const btn = block(id).locator('button.try-out__btn');
    const label = (await btn.textContent())?.trim();
    if (label && /try it out/i.test(label)) await btn.click();
  }

  async function bodyText(id) {
    return block(id).locator('textarea.body-param__text').inputValue();
  }

  async function setBody(id, obj) {
    await block(id).locator('textarea.body-param__text').fill(JSON.stringify(obj, null, 2));
  }

  async function setPathParam(id, name, value) {
    await block(id).locator(`tr[data-param-name="${name}"] input`).fill(value);
  }

  // Clica Execute e lê status + corpo da tabela de live response. O Clear antes
  // de re-executar é o que impede ler a resposta da execução anterior.
  async function execute(id) {
    const b = block(id);
    const clear = b.locator('button.btn-clear');
    if (await clear.count()) {
      await clear.click();
    }
    await b.locator('button.execute').click();
    const statusCell = b.locator('.live-responses-table tr.response td.response-col_status').first();
    await statusCell.waitFor();
    const status = (await statusCell.textContent()).trim().split(/\s/)[0];
    let body = '';
    const pre = b.locator('.live-responses-table tr.response td.response-col_description pre').first();
    if (await pre.count()) body = (await pre.textContent()) || '';
    return { status, body };
  }

  async function shot(id, name) {
    shotIdx += 1;
    const file = path.join(SHOTS, `${String(shotIdx).padStart(2, '0')}-${name}.png`);
    await block(id).screenshot({ path: file }).catch(() => page.screenshot({ path: file }));
  }

  const json = (s) => { try { return JSON.parse(s); } catch { return null; } };

  await page.goto(DOCS, { waitUntil: 'networkidle' });
  await page.waitForSelector('.opblock');

  // ─── ATO 1 · ENTRAR ───────────────────────────────────────────────
  // Passo 1: POST /api/auth/login — o README promete o exemplo já preenchido
  // com a credencial do seed; sem isso o Execute de primeira não funciona.
  await expand(OP.login); await tryOut(OP.login);
  const loginBody = await bodyText(OP.login);
  const prefilled = loginBody.includes('medico@prontomed.dev') && loginBody.includes('prontomed123');
  report('1a exemplo do login pré-preenchido', prefilled, prefilled ? 'credencial do seed no textarea' : `textarea: ${loginBody.slice(0, 120)}`);
  const r1 = await execute(OP.login);
  const login = json(r1.body);
  const tokensOk = r1.status === '200' && login?.accessToken && login?.refreshToken;
  report('1b login 200 com tokens', tokensOk, `status=${r1.status} accessToken=${!!login?.accessToken} refreshToken=${!!login?.refreshToken}`);
  await shot(OP.login, 'login');
  if (!tokensOk) throw new Error('sem token — roteiro não continua');

  // Passo 2: Authorize + GET /api/auth/me — identidade sai do token (INV-04).
  await page.locator('.auth-wrapper button.authorize').click();
  const dlg = page.locator('.dialog-ux');
  await dlg.locator('input').first().fill(login.accessToken);
  await dlg.locator('button.authorize').click();
  const loggedOut = await dlg.locator('button:has-text("Logout")').count();
  await dlg.locator('button:has-text("Close")').click();
  report('2a Authorize aceito', loggedOut > 0, 'modal passou a oferecer Logout');
  await expand(OP.me); await tryOut(OP.me);
  const r2 = await execute(OP.me);
  const me = json(r2.body);
  report('2b GET /auth/me identifica pelo token', r2.status === '200' && me?.email === 'medico@prontomed.dev', `status=${r2.status} email=${me?.email}`);
  await shot(OP.me, 'me');

  // ─── ATO 2 · PACIENTE ─────────────────────────────────────────────
  // Passo 3: POST /api/patients com o exemplo "Ficha completa" como está.
  await expand(OP.createPatient); await tryOut(OP.createPatient);
  const patientExample = await bodyText(OP.createPatient);
  report('3a exemplo do paciente pré-preenchido', patientExample.includes('Marina Duarte'), patientExample.slice(0, 80));
  const r3 = await execute(OP.createPatient);
  const patient = json(r3.body);
  report('3b paciente criado (RF-01)', r3.status === '201' && !!patient?.id, `status=${r3.status} id=${patient?.id}`);
  await shot(OP.createPatient, 'create-patient');
  if (!patient?.id) throw new Error('sem patientId — roteiro não continua');

  // Passo 4: GET /api/patients. A issue 8 da sprint 05.02 nasceu aqui: um
  // example pré-preenchia search="pedro" e o Execute literal devolvia 1
  // paciente em vez da lista. O campo tem que vir vazio.
  await expand(OP.listPatients); await tryOut(OP.listPatients);
  const searchInput = block(OP.listPatients).locator('tr[data-param-name="search"] input');
  const searchPrefill = await searchInput.inputValue();
  report('4a search sem prefill (issue 8)', searchPrefill === '', `valor="${searchPrefill}"`);
  const r4 = await execute(OP.listPatients);
  const list = json(r4.body);
  const names = JSON.stringify(list);
  const hasSeed = ['Pedro', 'Eduardo', 'Bruno'].every((n) => names.includes(n));
  report('4b listagem com seed + novo (RF-02)', r4.status === '200' && hasSeed && names.includes('Marina Duarte'), `status=${r4.status} seed=${hasSeed} novo=${names.includes('Marina Duarte')}`);
  await shot(OP.listPatients, 'list-patients');

  // ─── ATO 3 · AGENDA ───────────────────────────────────────────────
  // Slot fixo em 2027, longe dos horários do seed — determinismo, nunca "hoje".
  const SLOT = '2027-06-01T13:00:00.000Z';
  // Passo 5: agendar em horário livre.
  await expand(OP.schedule); await tryOut(OP.schedule);
  await setBody(OP.schedule, { patientId: patient.id, scheduledAt: SLOT });
  const r5 = await execute(OP.schedule);
  const apptA = json(r5.body);
  report('5 agendamento criado (RF-03)', r5.status === '201' && !!apptA?.id, `status=${r5.status} id=${apptA?.id}`);
  await shot(OP.schedule, 'schedule');
  if (!apptA?.id) throw new Error('sem appointmentId — roteiro não continua');

  // Passo 6: repetir o mesmo instante → 409 SCHEDULE_CONFLICT (INV-01).
  const r6 = await execute(OP.schedule);
  report('6 conflito de horário (RF-07/INV-01)', r6.status === '409' && r6.body.includes('SCHEDULE_CONFLICT'), `status=${r6.status} body=${r6.body.slice(0, 160)}`);
  await shot(OP.schedule, 'conflict-409');

  // Passo 7: cancelar devolve o horário. Sem este passo a INV-01 fica provada
  // pela metade — recusar o ocupado é meia regra; liberar no cancelamento é a
  // outra meia (o WHERE do índice parcial).
  await expand(OP.cancel); await tryOut(OP.cancel);
  await setPathParam(OP.cancel, 'id', apptA.id);
  const r7a = await execute(OP.cancel);
  report('7a cancelamento (RF-04)', r7a.status === '204', `status=${r7a.status}`);
  await shot(OP.cancel, 'cancel');
  const r7b = await execute(OP.schedule);
  const apptB = json(r7b.body);
  report('7b slot devolvido — mesmo horário 201', r7b.status === '201' && !!apptB?.id && apptB.id !== apptA.id, `status=${r7b.status} novoId=${apptB?.id}`);
  await shot(OP.schedule, 'reschedule-same-slot');
  if (!apptB?.id) throw new Error('sem novo appointment — roteiro não continua');

  // ─── ATO 4 · CONSULTA ─────────────────────────────────────────────
  // Passo 8: anotar na consulta que nasceu no passo 7.
  await expand(OP.addNote); await tryOut(OP.addNote);
  await setPathParam(OP.addNote, 'id', apptB.id);
  const noteExample = await bodyText(OP.addNote);
  report('8a exemplo da anotação pré-preenchido', noteExample.includes('content'), noteExample.slice(0, 80));
  const r8 = await execute(OP.addNote);
  report('8b anotação criada (RF-05)', r8.status === '201', `status=${r8.status} body=${r8.body.slice(0, 120)}`);
  await shot(OP.addNote, 'add-note');

  // Passo 9: linha do tempo. Devem aparecer DUAS consultas no mesmo horário —
  // a cancelada e a que nasceu no lugar (o README explica que não é duplicata).
  await expand(OP.timeline); await tryOut(OP.timeline);
  await setPathParam(OP.timeline, 'id', patient.id);
  const r9 = await execute(OP.timeline);
  const tl = json(r9.body);
  const tlStr = JSON.stringify(tl);
  const appts = tl?.appointments ?? tl?.data ?? tl?.items ?? [];
  const cancelled = tlStr.includes('CANCELLED');
  const noteVisible = tlStr.includes(json(noteExample)?.content?.slice(0, 30) ?? '@@');
  report('9 timeline com cancelada + ativa + anotação (RF-06)', r9.status === '200' && cancelled && noteVisible, `status=${r9.status} qtde=${Array.isArray(appts) ? appts.length : '?'} cancelada=${cancelled} anotação=${noteVisible}`);
  await shot(OP.timeline, 'timeline');

  // ─── ATO 5 · LGPD ─────────────────────────────────────────────────
  // Passo 10: anonimizar. Os dois lados do RF-08 moram em GETs diferentes
  // (issue 9 da sprint 05.02): a timeline prova o histórico intacto; a ficha
  // (GET /patients/:id) prova a PII apagada — a timeline não expõe dado
  // pessoal de propósito.
  await expand(OP.anonymize); await tryOut(OP.anonymize);
  await setPathParam(OP.anonymize, 'id', patient.id);
  const r10a = await execute(OP.anonymize);
  report('10a anonimização 204 (RF-08)', r10a.status === '204', `status=${r10a.status}`);
  await shot(OP.anonymize, 'anonymize');
  const r10b = await execute(OP.timeline);
  const tl2s = r10b.body;
  const piiGone = !tl2s.includes('marina@example.com') && !tl2s.includes('90000-0004') && !tl2s.includes('1990-04-18');
  const historyIntact = tl2s.includes('CANCELLED') && tl2s.includes(json(noteExample)?.content?.slice(0, 30) ?? '@@');
  report('10b histórico intacto na timeline (RF-08)', r10b.status === '200' && piiGone && historyIntact, `status=${r10b.status} piiAusente=${piiGone} histórico=${historyIntact}`);
  await shot(OP.timeline, 'timeline-pos-lgpd');
  await expand(OP.getPatient); await tryOut(OP.getPatient);
  await setPathParam(OP.getPatient, 'id', patient.id);
  const r10c = await execute(OP.getPatient);
  const p2 = json(r10c.body);
  const nameAnon = p2?.name === 'Paciente anonimizado';
  const piiNull = p2 && p2.phone === null && p2.email === null && p2.birthDate === null;
  report('10c anonimização visível em GET /patients/{id}', r10c.status === '200' && nameAnon && piiNull, `status=${r10c.status} name=${p2?.name} pii=null:${piiNull}`);
  await shot(OP.getPatient, 'get-patient-pos-lgpd');

  await browser.close();

  const fails = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - fails.length}/${results.length} verificações OK, ${fails.length} falhas ===`);
  fs.writeFileSync(path.join(__dirname, 'resultado.json'), JSON.stringify(results, null, 2));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('ERRO FATAL:', e.message); process.exit(2); });
