import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { EnvironmentService } from '@/shared/environments/environment.service';
import { setupSwagger } from '@/swagger.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  setupSwagger(app);

  const environment = app.get(EnvironmentService);

  // Host explícito: dentro do container, bind só em loopback não atravessa o
  // mapeamento de porta do Docker.
  await app.listen(environment.port, '0.0.0.0');
}

void bootstrap();
