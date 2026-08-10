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
 * **Idempotente:** rodar de novo reconfirma a credencial do `.env` em vez de falhar.
 * A garantia que o script dá não é "inseri uma linha", é **"a credencial documentada
 * no `.env` funciona"** — por isso ele reescreve o hash quando o médico já existe.
 * Sem isso, trocar `SEED_DOCTOR_PASSWORD` e rodar o seed não teria efeito nenhum, e
 * o login falharia com a senha que o `.env` promete.
 *
 * Revoga, **só para este script**, a decisão de 07/08/2026 de não tratar
 * idempotência fora da sprint dedicada (decisão do usuário, 10/08/2026). O que
 * continua na 06.01 é outra coisa: idempotência de **requisição HTTP**
 * (`Idempotency-Key`, DEBT-05), que se prova com o sistema sob carga. Aqui é um
 * comando de terminal que o avaliador roda à mão, e a segunda execução esbarrava em
 * `uk_doctors_email` com saída 1 — um vermelho na tela sem nada quebrado.
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

    // **ID, nunca email**, nas três saídas. `review-security.md §verifica` item 3
    // trata PII em log como achado ALTO, e a regra não abre exceção para dado de
    // demonstração: o que protege não é o valor deste email, é o hábito de nunca
    // logar o campo. A credencial está no `.env`, que é quem deve respondê-la.
    if (existing) {
      // `update`, e não um `return` seco: o hash é regravado porque a promessa do
      // script é que a senha do `.env` abre a porta. Um seed que só verificasse a
      // existência deixaria o avaliador que trocou `SEED_DOCTOR_PASSWORD` com um
      // login quebrado e nenhuma pista do porquê.
      await doctors.update({ id: existing.id }, { passwordHash });

      logger.log(`Médico de demonstração já existia; credencial reconfirmada: ${existing.id}`);

      return;
    }

    const inserted = await doctors.insert({
      name: 'Dra. Helena Prado',
      email,
      passwordHash,
    });

    logger.log(`Médico de demonstração criado: ${inserted.identifiers[0].id}`);
  } finally {
    await application.close();
  }
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
