import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { Doctor } from '@/domains/domain/model-entities/doctor.entity';
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
   * A regressão que este caso trava: até 10/08/2026 a segunda execução esbarrava em
   * `uk_doctors_email` e saía com código 1 — o único ponto do roteiro do README onde
   * o avaliador via vermelho sem nada estar quebrado.
   */
  it('roda três vezes sem falhar e sem duplicar', async () => {
    await seed();
    await seed();
    await seed();

    expect(await dataSource.getRepository(Doctor).count()).toBe(1);
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
});
