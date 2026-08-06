import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { EnvironmentService } from '@/shared/environments/environment.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  const environment = app.get(EnvironmentService);

  // Host explícito: dentro do container, bind só em loopback não atravessa o
  // mapeamento de porta do Docker.
  await app.listen(environment.port, '0.0.0.0');
}

void bootstrap();
