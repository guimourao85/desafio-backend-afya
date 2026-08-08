import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { Doctor } from '@/domains/domain/model-entities/doctor.entity';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { EnvironmentService } from '@/shared/environments/environment.service';
import { PasswordHasher } from '@/shared/interfaces/cryptography/password-hasher';

/**
 * Cria o médico de demonstração — e só ele. Sem uma credencial no banco, o login não
 * é exercitável no Swagger e nada do que vier depois pode ser validado à mão até F6.
 * Pacientes e consultas entram em 05.01.
 *
 * Sobe o contexto do Nest em vez de abrir a própria conexão: assim o hash de senha
 * sai do **mesmo** `PasswordHasher` que o login usa, com o mesmo custo, e a
 * configuração continua vindo do `EnvironmentService` já validado. Um `bcrypt.hash`
 * solto aqui seria uma segunda fonte de verdade sobre como uma senha é guardada.
 *
 * **Não é idempotente, de propósito.** Rodar duas vezes esbarra em
 * `uk_doctors_email` e falha — comportamento declarado, não defeito. Idempotência é
 * tema de sprint própria.
 */
async function seed(): Promise<void> {
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

    const email = environment.get('SEED_DOCTOR_EMAIL');

    const inserted = await dataSource.getRepository(Doctor).insert({
      name: 'Dra. Helena Prado',
      // Mesma normalização que o schema Zod aplica na borda do login. Sem ela, um
      // `SEED_DOCTOR_EMAIL` com maiúscula gravaria uma linha que o login não acha.
      email: email.trim().toLowerCase(),
      passwordHash: await passwordHasher.hash(environment.get('SEED_DOCTOR_PASSWORD')),
    });

    // **ID, nunca email.** `review-security.md §verifica` item 3 trata PII em log
    // como achado ALTO, e a regra não abre exceção para dado de demonstração: o que
    // protege não é o valor deste email, é o hábito de nunca logar o campo. A
    // credencial de acesso está no `.env`, que é quem deve respondê-la.
    logger.log(`Médico de demonstração criado: ${inserted.identifiers[0].id}`);
  } finally {
    await application.close();
  }
}

seed().catch((error: unknown) => {
  new Logger('DemoSeed').error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
