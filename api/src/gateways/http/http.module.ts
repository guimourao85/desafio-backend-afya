import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

import { HealthController } from './controllers/core';
import { ZodValidationPipe } from './pipes/zod-validation-pipe';

/**
 * Concentra o transporte: controllers e, a partir de F2, os módulos de domínio e
 * o `APP_GUARD`. Controller não mora em módulo de domínio — regra e transporte
 * não se misturam.
 */
@Module({
  controllers: [HealthController],
  providers: [{ provide: APP_PIPE, useClass: ZodValidationPipe }],
})
export class HttpModule {}
