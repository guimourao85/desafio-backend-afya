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
 * O ano das consultas concluídas. **Literal, nunca `new Date()`** (sprint 05.01,
 * decisão 6): seed que muda de resultado conforme o dia em que roda quebra o roteiro
 * do README e qualquer asserção sobre ele.
 *
 * A consulta agendada usa `SEED_YEAR + 1`, e o que esse `+1` entrega é **ordem
 * determinística** na linha do tempo — não "futuro". Com 2026 as duas concluídas
 * caem no passado e a agendada em 15/05/2027 fica adiante, o que lê coerente para
 * quem avaliar em 2026; avaliado em 2029 o conjunto inteiro está no passado, e nada
 * quebra: `appointment.schema.ts` aceita data passada de propósito, porque registrar
 * atendimento retroativo é caso real de prontuário. O conserto, se um dia incomodar,
 * é trocar este literal.
 */
const SEED_YEAR = 2026;

/**
 * Os três pacientes dos wireframes (`PLAN.md §2`), com os sete campos que a tabela
 * `patients` tem — **todos fixados no sprint-doc antes de existir código**
 * (`sprint-05.01 §nomes`). Nada aqui é improvisado, e nada aqui é dado de gente de
 * verdade: telefones na faixa `9000X` e domínio `example.com` (RFC 2606) são
 * reconhecidamente não-roteáveis.
 */
const DEMO_PATIENTS = [
  {
    name: 'Pedro Álvares',
    phone: '(11) 90000-0001',
    email: 'pedro@example.com',
    birthDate: '1987-03-12',
    sex: PatientSex.MALE,
    heightM: 1.68,
    weightKg: 75,
  },
  {
    name: 'Eduardo Ramos',
    phone: '(11) 90000-0002',
    email: 'eduardo@example.com',
    birthDate: '1975-11-04',
    sex: PatientSex.MALE,
    heightM: 1.81,
    weightKg: 92.4,
  },
  {
    // **Bruno existe de propósito, e sem consulta nenhuma.** Paciente sem histórico
    // é o caso que a linha do tempo precisa saber mostrar — 200 com `data` vazio,
    // nunca 404 — e ninguém cria à mão só para conferir isso.
    name: 'Bruno Teixeira',
    phone: '(11) 90000-0003',
    email: 'bruno@example.com',
    birthDate: '1994-06-23',
    sex: PatientSex.MALE,
    heightM: 1.74,
    weightKg: 68,
  },
] as const;

/**
 * A agenda de demonstração. `patient` é o índice em `DEMO_PATIENTS`; instantes em
 * **UTC**, como o schema da borda exige.
 *
 * Duas concluídas com anotação e uma agendada sem — é o mínimo que demonstra RF-04
 * (agenda), RF-05 (anotar) e RF-06 (linha do tempo) sem o avaliador criar nada. A
 * consulta de 15/05 é também o alvo do 409 do roteiro: marcar de novo no mesmo
 * instante é o **comportamento pretendido**, não um defeito do seed.
 */
const DEMO_APPOINTMENTS = [
  {
    patient: 0,
    scheduledAt: `${SEED_YEAR}-01-01T09:00:00.000Z`,
    status: AppointmentStatus.COMPLETED,
    note: 'Paciente relatou vermelhidão na pele do antebraço esquerdo, sem prurido. Orientado uso de hidratante e retorno em 30 dias se persistir.',
  },
  {
    patient: 1,
    scheduledAt: `${SEED_YEAR}-02-10T10:30:00.000Z`,
    status: AppointmentStatus.COMPLETED,
    note: 'Consulta de rotina. Pressão arterial dentro da faixa esperada. Solicitados exames laboratoriais de rotina para o retorno.',
  },
  {
    patient: 0,
    scheduledAt: `${SEED_YEAR + 1}-05-15T14:00:00.000Z`,
    status: AppointmentStatus.SCHEDULED,
    note: null,
  },
] as const;

/**
 * Popula o banco de desenvolvimento com o estado inicial que a avaliação pressupõe:
 * o médico demo, três pacientes, três consultas e duas anotações.
 *
 * Sobe o contexto do Nest em vez de abrir a própria conexão: assim o hash de senha
 * sai do **mesmo** `PasswordHasher` que o login usa, com o mesmo custo, a
 * configuração continua vindo do `EnvironmentService` já validado, e paciente e
 * consulta entram pelas **portas de repositório** — os mesmos adapters que a API
 * usa. Um `insert` cru nas três tabelas seria mais curto e furaria INV-05 no arquivo
 * mais copiado do projeto.
 *
 * **Idempotente por existência do médico** (decisão 8): a segunda execução
 * reconfirma a credencial do `.env` e **não insere mais nada**, saindo 0. Um
 * `TRUNCATE` apagaria o trabalho manual de quem estava testando; um segundo insert
 * colidiria no índice parcial de INV-01, e o avaliador concluiria que a agenda está
 * quebrada.
 *
 * O hash é regravado porque a promessa do script não é "inseri uma linha", é **"a
 * credencial documentada no `.env` funciona"**: sem isso, trocar
 * `SEED_DOCTOR_PASSWORD` e rodar o seed não teria efeito nenhum, e o login falharia
 * com a senha que o `.env` promete.
 *
 * Revoga, **só para este script**, a decisão de 07/08/2026 de não tratar
 * idempotência fora da sprint dedicada (decisão do usuário, 10/08/2026). O que
 * continua em aberto é outra coisa: idempotência de **requisição HTTP**
 * (`Idempotency-Key`, DEBT-05) — script de terminal e rota têm custos diferentes.
 */
export async function seed(): Promise<void> {
  const logger = new Logger('DemoSeed');
  const application = await NestFactory.createApplicationContext(AppModule, {
    // `log` incluído: sem ele o próprio `logger.log` de confirmação é engolido, e o
    // seed termina em silêncio — indistinguível de não ter rodado.
    logger: ['error', 'warn', 'log'],
  });

  try {
    const environment = application.get(EnvironmentService);

    // Fail-closed pelo ambiente do **projeto** (`APP_ENV`), não pelo `NODE_ENV`:
    // popular um banco de produção com credencial conhecida é um jeito silencioso
    // de abrir a porta da frente.
    if (!environment.isDevelopment) {
      throw new Error(
        `O seed de demonstração só roda com APP_ENV=dev (atual: ${environment.appEnv}).`,
      );
    }

    const passwordHasher = application.get(PasswordHasher);
    const dataSource = application.get<DataSource>(PRONTOMED_POSTGRES_DATA_SOURCE);

    const doctors = dataSource.getRepository(Doctor);

    // Mesma normalização que o schema Zod aplica na borda do login. Sem ela, um
    // `SEED_DOCTOR_EMAIL` com maiúscula gravaria uma linha que o login não acha — e
    // aqui ela também é o que faz a busca abaixo encontrar o que o insert gravou.
    const email = environment.get('SEED_DOCTOR_EMAIL').trim().toLowerCase();
    const passwordHash = await passwordHasher.hash(environment.get('SEED_DOCTOR_PASSWORD'));

    const existing = await doctors.findOneBy({ email });

    // **ID, nunca email** — e nunca nome de paciente, telefone ou conteúdo de
    // anotação. `review-security.md §verifica` item 3 trata PII em log como achado
    // ALTO, e a regra não abre exceção para dado de demonstração: o que protege não
    // é o valor deste email, é o hábito de nunca logar o campo. A credencial está no
    // `.env`, que é quem deve respondê-la.
    if (existing) {
      // `update`, e não um `return` seco: o hash é regravado porque a promessa do
      // script é que a senha do `.env` abre a porta. Os pacientes e as consultas
      // **não** são recriados — é aqui que a idempotência acontece.
      await doctors.update({ id: existing.id }, { passwordHash });

      logger.log(
        `Médico de demonstração já existia; credencial reconfirmada, nada mais inserido: ${existing.id}`,
      );

      return;
    }

    const inserted = await doctors.insert({
      name: 'Dra. Helena Prado',
      email,
      passwordHash,
    });

    const doctorId = inserted.identifiers[0].id as string;

    logger.log(`Médico de demonstração criado: ${doctorId}`);

    await seedDemoAgenda(
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
 * Os pacientes, as consultas e as anotações — pelas **portas**, nunca por `insert`
 * cru.
 *
 * Roda só no caminho de criação: alcançar esta função significa que o médico acabou
 * de nascer, então não existe paciente nem consulta dele para duplicar, e INV-01 não
 * tem como colidir.
 */
async function seedDemoAgenda(
  patients: PatientRepository,
  appointments: AppointmentRepository,
  doctorId: string,
  logger: Logger,
): Promise<void> {
  const created: Patient[] = [];

  for (const data of DEMO_PATIENTS) {
    // Sem `?? null` em campo nenhum, e isso é o controle contra PII improvisada: a
    // tabela do `§nomes` preenche os sete campos, então campo sem valor fixado no
    // sprint-doc simplesmente não tem como entrar no banco por aqui.
    const patient = await patients.create(
      Object.assign(new Patient(), { doctorId, ...data, anonymizedAt: null }),
    );

    created.push(patient);
  }

  logger.log(`Pacientes de demonstração criados: ${created.map((patient) => patient.id).join(', ')}`);

  for (const data of DEMO_APPOINTMENTS) {
    // O estado inicial vai no literal, e `complete()` **não** é chamado (decisão 7):
    // aquele método guarda uma **transição** de agendada para concluída, e o seed
    // não transita — ele declara o estado em que o mundo já nasce.
    const appointment = await appointments.create(
      Object.assign(new Appointment(), {
        doctorId,
        patientId: created[data.patient].id,
        scheduledAt: new Date(data.scheduledAt),
        status: data.status,
      }),
    );

    if (!data.note) continue;

    // `addNote()` é a **única fábrica** de `ConsultationNote` (INV-05). Um seed que a
    // contornasse seria o primeiro cliente a provar que a invariante é opcional — no
    // arquivo que todo mundo copia. Consulta concluída **aceita** anotação: o guarda
    // é `isActive()`, e só a cancelada recusa.
    const note = appointment.addNote(data.note);

    if (note.isLeft()) {
      throw new Error(`Anotação recusada pela consulta ${appointment.id}: ${note.value.message}`);
    }

    await appointments.appendNotes(appointment);
  }

  logger.log(`Agenda de demonstração criada: ${DEMO_APPOINTMENTS.length} consultas`);
}

// Só executa quando o arquivo **é** o comando (`npm run seed`). Sem este guarda,
// importar o módulo num teste dispararia o seed e, pior, o `process.exit(1)` do
// `catch` derrubaria o processo do Jest no meio da suíte.
if (require.main === module) {
  seed().catch((error: unknown) => {
    new Logger('DemoSeed').error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
