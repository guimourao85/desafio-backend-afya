import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { Appointment, AppointmentStatus } from '@/domains/domain/model-entities/appointment.entity';
import { ConsultationNote } from '@/domains/domain/model-entities/consultation-note.entity';
import { Doctor } from '@/domains/domain/model-entities/doctor.entity';
import { Patient } from '@/domains/domain/model-entities/patient.entity';
import { seed } from '@/infrastructure/databases/typeorm/postgres/seeds/demo.seed';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { PasswordHasher } from '@/shared/interfaces/cryptography/password-hasher';

import { truncateAll } from '../factories/truncate-all';

/**
 * O seed de demonstração é o passo 7 do roteiro do README, e o único comando que o
 * avaliador roda cujo efeito não é verificável por nenhuma rota. Ele tem teste pela
 * mesma razão que a migration tem revisão: é infraestrutura que decide se todo o
 * resto é exercitável.
 *
 * O que se prova aqui é a **promessa** do script — "a credencial do `.env` abre a
 * porta" —, e não a sua implementação. Por isso as asserções olham o banco e o
 * `PasswordHasher`, nunca quantos `INSERT` foram emitidos.
 */
describe('Seed de demonstração (e2e)', () => {
  let dataSource: DataSource;
  let passwordHasher: PasswordHasher;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const application = moduleRef.createNestApplication();
    await application.init();

    dataSource = application.get<DataSource>(PRONTOMED_POSTGRES_DATA_SOURCE);
    passwordHasher = application.get(PasswordHasher);
  });

  beforeEach(async () => {
    await truncateAll(dataSource);
  });

  afterAll(async () => {
    await truncateAll(dataSource);
    await dataSource.destroy();
  });

  it('cria o médico de demonstração quando o banco está vazio', async () => {
    await seed();

    const doctors = await dataSource.getRepository(Doctor).find();

    expect(doctors).toHaveLength(1);
    expect(doctors[0].email).toBe(process.env.SEED_DOCTOR_EMAIL?.trim().toLowerCase());
  });

  /**
   * O seed é idempotente: sem isso, a segunda execução esbarraria em
   * `uk_doctors_email` e sairia com código 1 — o único ponto do roteiro do README
   * onde o avaliador veria vermelho sem nada estar quebrado. Este teste prova que a
   * re-execução não duplica.
   */
  it('roda três vezes sem falhar e sem duplicar', async () => {
    await seed();
    await seed();
    await seed();

    expect(await dataSource.getRepository(Doctor).count()).toBe(1);
    // As três tabelas, não só a de médicos: a partir da sprint 05.01 o seed grava
    // paciente e consulta, e é a **consulta** que traz o risco real da repetição —
    // um segundo insert no mesmo slot bate no índice parcial de INV-01 e derruba o
    // comando com um vermelho que o avaliador leria como agenda quebrada.
    expect(await dataSource.getRepository(Patient).count()).toBe(3);
    expect(await dataSource.getRepository(Appointment).count()).toBe(3);
    expect(await dataSource.getRepository(ConsultationNote).count()).toBe(2);
  });

  /**
   * A parte que um `ON CONFLICT DO NOTHING` não daria: o script promete que a senha
   * do `.env` funciona, então rodar de novo tem de **reconfirmar** a credencial, não
   * apenas deixar a linha existente em paz.
   */
  it('reconfirma a senha do .env sobre um hash antigo', async () => {
    await seed();

    const doctors = dataSource.getRepository(Doctor);
    const antes = await doctors.findOneByOrFail({
      email: process.env.SEED_DOCTOR_EMAIL!.trim().toLowerCase(),
    });

    // Simula o `.env` tendo sido editado depois de um seed anterior: o banco fica
    // com um hash que não corresponde mais à senha documentada.
    await doctors.update({ id: antes.id }, { passwordHash: await passwordHasher.hash('senha-velha-123') });

    await seed();

    const depois = await doctors.findOneByOrFail({ id: antes.id });

    expect(
      await passwordHasher.compare(process.env.SEED_DOCTOR_PASSWORD!, depois.passwordHash),
    ).toBe(true);
    // E continua sendo a mesma linha — reconfirmar não é recriar.
    expect(await doctors.count()).toBe(1);
  });

  it('nunca grava a senha em claro', async () => {
    await seed();

    const doctor = await dataSource.getRepository(Doctor).findOneByOrFail({
      email: process.env.SEED_DOCTOR_EMAIL!.trim().toLowerCase(),
    });

    expect(doctor.passwordHash).not.toContain(process.env.SEED_DOCTOR_PASSWORD!);
    expect(doctor.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  /**
   * O estado inicial que o roteiro de avaliação pressupõe. O que se prova aqui não é
   * "o insert rodou": é que o avaliador encontra **uma agenda com história** ao abrir
   * o `/api/docs` — sem isso, RF-04, RF-05 e RF-06 exigiriam criar tudo à mão antes
   * de haver o que ver.
   */
  describe('estado de demonstração', () => {
    beforeEach(async () => {
      await seed();
    });

    it('cria os três pacientes dos wireframes, todos ativos', async () => {
      const patients = await dataSource.getRepository(Patient).find({ order: { name: 'ASC' } });

      expect(patients.map((patient) => patient.name)).toEqual([
        'Bruno Teixeira',
        'Eduardo Ramos',
        'Pedro Álvares',
      ]);
      // Nenhum nasce anonimizado: o seed não exercita INV-02, e o passo de LGPD do
      // roteiro precisa de um paciente que **ainda** possa ser anonimizado.
      expect(patients.every((patient) => patient.anonymizedAt === null)).toBe(true);
    });

    it('grava exatamente a PII fixada no sprint-doc, sem campo improvisado', async () => {
      const pedro = await dataSource
        .getRepository(Patient)
        .findOneByOrFail({ name: 'Pedro Álvares' });

      // A tabela do `§nomes` é fonte única: qualquer valor que não esteja lá é o
      // sinal de que dado inventado — ou real — entrou no seed.
      expect(pedro).toMatchObject({
        phone: '(11) 90000-0001',
        email: 'pedro@example.com',
        birthDate: '1987-03-12',
        sex: 'MALE',
        heightM: 1.68,
        weightKg: 75,
      });
    });

    it('cria duas consultas concluídas com anotação e uma agendada sem', async () => {
      const appointments = await dataSource
        .getRepository(Appointment)
        .find({ relations: { notes: true }, order: { scheduledAt: 'ASC' } });

      expect(
        appointments.map((appointment) => [
          appointment.scheduledAt.toISOString(),
          appointment.status,
          appointment.notes?.length,
        ]),
      ).toEqual([
        ['2026-01-01T09:00:00.000Z', AppointmentStatus.COMPLETED, 1],
        ['2026-02-10T10:30:00.000Z', AppointmentStatus.COMPLETED, 1],
        ['2027-05-15T14:00:00.000Z', AppointmentStatus.SCHEDULED, 0],
      ]);
    });

    it('deixa Bruno sem consulta nenhuma — o caso que a linha do tempo precisa mostrar', async () => {
      const bruno = await dataSource
        .getRepository(Patient)
        .findOneByOrFail({ name: 'Bruno Teixeira' });

      expect(await dataSource.getRepository(Appointment).countBy({ patientId: bruno.id })).toBe(0);
    });

    /**
     * As datas saem de `SEED_YEAR`, nunca de `new Date()`. Sem isto, a asserção de
     * cima passaria a falhar sozinha na virada do ano — e, pior, o roteiro do README
     * descreveria consultas que não existem mais nas datas que ele cita.
     */
    it('usa datas fixas, independentes do dia em que o seed roda', async () => {
      const anos = (await dataSource.getRepository(Appointment).find()).map((appointment) =>
        appointment.scheduledAt.getUTCFullYear(),
      );

      expect(anos.sort((a, b) => a - b)).toEqual([2026, 2026, 2027]);
    });
  });
});
