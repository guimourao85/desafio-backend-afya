import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { Appointment, AppointmentStatus } from '@/domains/domain/model-entities/appointment.entity';
import { Doctor } from '@/domains/domain/model-entities/doctor.entity';
import { Patient, PatientSex } from '@/domains/domain/model-entities/patient.entity';
import { AppointmentRepository } from '@/domains/domain/repositories/appointment.repository';
import { PatientRepository } from '@/domains/domain/repositories/patient.repository';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { APPOINTMENTS_REPOSITORY, PATIENTS_REPOSITORY } from '@/shared/constants/repositories';
import { EnvironmentService } from '@/shared/environments/environment.service';
import { PasswordHasher } from '@/shared/interfaces/cryptography/password-hasher';

/**
 * O médico de estresse — **dono exclusivo** de todo o volume que este arquivo cria.
 *
 * Ele existe para que a carga não encoste no médico de demonstração: INV-04 escopa
 * toda leitura por `doctor_id`, então o roteiro do README continua vendo três
 * pacientes e três consultas mesmo com milhares de linhas na tabela ao lado. É o
 * contrário do que um seed parametrizado faria (sprint 06.01, decisão 6).
 *
 * **A credencial é fixture, não segredo**, e por isso é literal aqui em vez de vir
 * do `.env`: o k6 precisa dela para fazer login, e o único jeito de os dois lados
 * concordarem sem uma terceira variável de ambiente é o literal. O par idêntico vive
 * em `api/test/stress/stress-test.js` — mexeu num, mexa no outro. O que impede isso
 * de virar porta aberta não é o valor da senha: é a guarda de ambiente abaixo, que
 * recusa rodar fora de `APP_ENV=dev`.
 */
const STRESS_DOCTOR_EMAIL = 'k6.stress@prontomed.dev';
const STRESS_DOCTOR_PASSWORD = 'k6-stress-prontomed';

/**
 * O volume. **Número sem volume não é medida** (sprint 06.01, decisão 7): quem ler
 * o p95 no README precisa saber sobre quantas linhas ele foi medido, e a fonte
 * desse "quantas" é aqui.
 *
 * 500 pacientes e 2.000 consultas não são "produção" — são o suficiente para que
 * `ILIKE` sem índice de texto e `OFFSET` deixem de ser gratuitos, que é o que a
 * medição procura. Subir a ordem de grandeza só encareceria o seed sem mudar a
 * **forma** da curva, que é o que a sprint entrega.
 */
export const LOAD_PATIENT_COUNT = 500;
export const LOAD_APPOINTMENT_COUNT = 2000;

/**
 * Quantas escritas voam em paralelo. O pool do app é **10** (verificado em
 * `pg-pool/index.js:89`; `database.providers.ts` não declara `extra`): pedir mais
 * que isso não acelera nada, só enfileira dentro do driver.
 */
const WRITE_CONCURRENCY = 10;

/**
 * O primeiro instante da agenda de carga, e o passo entre consultas.
 *
 * **Literal, nunca `new Date()`** — mesma razão do `demo.seed.ts`: seed que muda de
 * resultado conforme o dia em que roda quebra a re-execução idempotente e qualquer
 * asserção sobre o conjunto. Passo de 15 minutos mantém cada `scheduled_at` único
 * para este médico, que é o que INV-01 exige do índice parcial.
 *
 * 2.000 consultas × 15 min ≈ 21 dias a partir de 01/03/2027 — bem longe do
 * `STRESS_SLOT` do k6 (2099), que precisa nascer vazio a cada execução.
 */
const AGENDA_START = '2027-03-01T08:00:00.000Z';
const AGENDA_STEP_MINUTES = 15;

/**
 * Os pedaços de que os nomes são montados. 20 × 25 = 500 combinações **únicas** —
 * exatamente `LOAD_PATIENT_COUNT`, o que garante que a busca por nome encontre
 * variação real em vez de 500 linhas idênticas.
 *
 * Nada aqui é gente de verdade, e a construção é a mesma do `demo.seed.ts`:
 * telefones na faixa `9xxxx` e domínio `example.com` (RFC 2606) são reconhecidamente
 * não-roteáveis.
 */
const FIRST_NAMES = [
  'Ana', 'Bruno', 'Carla', 'Daniel', 'Elisa', 'Fábio', 'Gabriela', 'Henrique',
  'Isabel', 'João', 'Karina', 'Lucas', 'Mariana', 'Nelson', 'Olívia', 'Paulo',
  'Renata', 'Sérgio', 'Tatiana', 'Vinícius',
];

const LAST_NAMES = [
  'Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Ferreira', 'Gonçalves',
  'Henriques', 'Ibrahim', 'Jardim', 'Klein', 'Lacerda', 'Machado', 'Nogueira',
  'Oliveira', 'Pacheco', 'Queiroz', 'Ribeiro', 'Santana', 'Teixeira', 'Uchôa',
  'Vasconcelos', 'Werneck', 'Xavier', 'Zanetti',
];

const SEXES = [PatientSex.MALE, PatientSex.FEMALE, PatientSex.OTHER, PatientSex.UNDISCLOSED];

/**
 * Popula o banco de **desenvolvimento** com o volume que a medição de carga exige
 * (sprint 06.01, passo 1 do §escopo).
 *
 * Sobe o contexto do Nest e escreve pelas **portas de repositório**, pelos mesmos
 * motivos do `demo.seed.ts`: o hash sai do `PasswordHasher` que o login usa, a
 * configuração vem do `EnvironmentService` já validado, e as invariantes do modelo
 * valem também para o dado de carga. Um `insert` cru seria mais rápido e ensinaria,
 * no arquivo mais copiado depois do seed de demonstração, que a porta é opcional.
 *
 * **Idempotente por existência do médico** (decisão 17): `npm run test:stress` chama
 * este script a cada execução, então a segunda chamada precisa custar quase nada e
 * **não** duplicar volume. Nem sequer o hash é regravado — ao contrário do
 * `demo.seed.ts`, esta credencial não é documentada para ninguém digitar: ela existe
 * para o k6, que a lê do literal acima.
 *
 * **O estrago é contido por INV-04**: nada do que este arquivo cria aparece para o
 * médico de demonstração, porque toda listagem filtra por `doctor_id`.
 * `docker compose down -v` reseta tudo.
 */
export async function seed(): Promise<void> {
  const logger = new Logger('LoadSeed');
  const application = await NestFactory.createApplicationContext(AppModule, {
    // `log` incluído: sem ele o seed termina em silêncio, indistinguível de não ter
    // rodado — e aqui ele é a única evidência de que o volume existe.
    logger: ['error', 'warn', 'log'],
  });

  try {
    const environment = application.get(EnvironmentService);

    // Duas guardas, dois riscos diferentes.
    //
    // `APP_ENV` é o fail-closed de ambiente, herdado do `demo.seed.ts`: encher um
    // banco que não é de desenvolvimento com meio milhar de pacientes sintéticos é
    // estrago que ninguém desfaz por `UPDATE`.
    if (!environment.isDevelopment) {
      throw new Error(
        `O seed de carga só roda com APP_ENV=dev (atual: ${environment.appEnv}).`,
      );
    }

    // `NODE_ENV=test` é a guarda do **outro** banco (edge 9 do §edge-cases): com ele,
    // a conexão aponta para `prontomed_test`, e despejar volume lá atropelaria a
    // suíte e2e — que trunca tabelas e conta linhas.
    if (environment.nodeEnv === 'test') {
      throw new Error(
        'O seed de carga não roda com NODE_ENV=test: esse é o banco da suíte e2e.',
      );
    }

    const passwordHasher = application.get(PasswordHasher);
    const dataSource = application.get<DataSource>(PRONTOMED_POSTGRES_DATA_SOURCE);
    const doctors = dataSource.getRepository(Doctor);

    const existing = await doctors.findOneBy({ email: STRESS_DOCTOR_EMAIL });

    if (existing) {
      // É aqui que a idempotência acontece: o volume já está no banco, e recriá-lo
      // colidiria no índice parcial de INV-01 logo na primeira consulta repetida.
      //
      // **A guarda é a existência do médico, e o médico nasce ANTES do volume.** Se
      // uma execução anterior morreu no meio do lote, esta aqui diria "já existia" e
      // deixaria o banco com volume pela metade — em silêncio, e o k6 depois falharia
      // por um motivo que não aponta para cá. A contagem transforma esse estado mudo
      // num aviso com a saída escrita. Não conserta sozinho de propósito: apagar
      // linha de paciente por conta própria é decisão que o script não deve tomar.
      const volume = await dataSource
        .getRepository(Patient)
        .countBy({ doctorId: existing.id });

      if (volume !== LOAD_PATIENT_COUNT) {
        logger.warn(
          `Volume incompleto: ${volume} pacientes onde o esperado é ${LOAD_PATIENT_COUNT}. ` +
            'Uma execução anterior provavelmente falhou no meio. Recomece do zero com ' +
            '`docker compose down -v` e refaça migrations e seeds.',
        );

        return;
      }

      logger.log(`Volume de carga já existia; nada inserido. Médico: ${existing.id}`);

      return;
    }

    const passwordHash = await passwordHasher.hash(STRESS_DOCTOR_PASSWORD);

    const inserted = await doctors.insert({
      name: 'Dr. Carga Sintética',
      email: STRESS_DOCTOR_EMAIL,
      passwordHash,
    });

    // **ID, nunca email** — `review-security.md §verifica` item 3 trata PII em log
    // como achado ALTO, e a regra não abre exceção para dado sintético.
    const doctorId = inserted.identifiers[0].id as string;

    logger.log(`Médico de estresse criado: ${doctorId}`);

    await seedVolume(
      application.get<PatientRepository>(PATIENTS_REPOSITORY),
      application.get<AppointmentRepository>(APPOINTMENTS_REPOSITORY),
      doctorId,
      logger,
    );
  } finally {
    await application.close();
  }
}

/**
 * Os pacientes, as consultas e as anotações do médico de estresse.
 *
 * Roda só no caminho de criação — alcançar esta função significa que o médico acabou
 * de nascer, então não há nada dele para duplicar e INV-01 não tem como colidir.
 */
async function seedVolume(
  patients: PatientRepository,
  appointments: AppointmentRepository,
  doctorId: string,
  logger: Logger,
): Promise<void> {
  const created: Patient[] = [];

  for (const batch of chunk(range(LOAD_PATIENT_COUNT), WRITE_CONCURRENCY)) {
    const persisted = await Promise.all(
      batch.map((index) => patients.create(buildPatient(doctorId, index))),
    );

    created.push(...persisted);
  }

  logger.log(`Pacientes de carga criados: ${created.length}`);

  const agendaStart = new Date(AGENDA_START).getTime();
  let notes = 0;

  for (const batch of chunk(range(LOAD_APPOINTMENT_COUNT), WRITE_CONCURRENCY)) {
    const results = await Promise.all(
      batch.map(async (index) => {
        // O paciente é o índice módulo o total: as consultas ficam distribuídas por
        // toda a base em vez de empilhadas em poucos prontuários, que é o que faz a
        // linha do tempo medir uma leitura realista.
        const patient = created[index % created.length];

        const appointment = await appointments.create(
          Object.assign(new Appointment(), {
            doctorId,
            patientId: patient.id,
            scheduledAt: new Date(agendaStart + index * AGENDA_STEP_MINUTES * 60_000),
            // Uma em cada três nasce concluída. Sem consulta concluída não há
            // anotação, e sem anotação a linha do tempo mede um `JOIN` que não
            // encontra nada — número bonito e falso.
            status: index % 3 === 0 ? AppointmentStatus.COMPLETED : AppointmentStatus.SCHEDULED,
          }),
        );

        if (appointment.status !== AppointmentStatus.COMPLETED) return false;

        // `addNote()` é a **única fábrica** de `ConsultationNote` (INV-05). Vale para
        // dado sintético igual: um seed que a contornasse provaria que a invariante
        // é opcional.
        const note = appointment.addNote(
          `Atendimento de carga #${index}. Registro sintético, sem conteúdo clínico real.`,
        );

        if (note.isLeft()) {
          throw new Error(`Anotação recusada pela consulta ${appointment.id}: ${note.value.message}`);
        }

        await appointments.appendNotes(appointment);

        return true;
      }),
    );

    notes += results.filter(Boolean).length;
  }

  logger.log(
    `Agenda de carga criada: ${LOAD_APPOINTMENT_COUNT} consultas, ${notes} anotações`,
  );
}

/**
 * Um paciente derivado **só** do índice — nenhuma aleatoriedade.
 *
 * Data de nascimento, altura e peso ficam dentro das faixas que os `CHECK` da tabela
 * cobram (`patient.entity.ts`): o seed não passa pela borda HTTP, então é o banco que
 * o barraria, e com 500 linhas por execução o erro apareceria no meio do lote.
 */
function buildPatient(doctorId: string, index: number): Patient {
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
  const lastName = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];

  return Object.assign(new Patient(), {
    doctorId,
    name: `${firstName} ${lastName}`,
    phone: `(11) 9${String(index).padStart(4, '0')}-0000`,
    email: `carga-${index}@example.com`,
    birthDate: `${1950 + (index % 50)}-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`,
    sex: SEXES[index % SEXES.length],
    heightM: Number((1.5 + (index % 40) / 100).toFixed(2)),
    weightKg: 50 + (index % 60),
    anonymizedAt: null,
  });
}

/** `[0, 1, ..., size - 1]`. */
function range(size: number): number[] {
  return Array.from({ length: size }, (_, index) => index);
}

/** Fatia a lista em lotes de `size` — o que dá ao `Promise.all` um teto. */
function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];

  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }

  return batches;
}

// Só executa quando o arquivo **é** o comando (`npm run seed:load`). Sem este guarda,
// importar o módulo dispararia o seed, e o `process.exit(1)` do `catch` derrubaria o
// processo que importou.
if (require.main === module) {
  seed().catch((error: unknown) => {
    new Logger('LoadSeed').error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
