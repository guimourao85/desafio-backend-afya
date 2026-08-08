import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

import { AuthenticationModule } from '@/domains/domain/services/authentication/authentication.module';

import { HealthController } from './controllers/core';
import { AuthenticateDoctorController } from './controllers/domain/authentication';
import { ZodValidationPipe } from './pipes/zod-validation-pipe';

/**
 * Concentra o transporte: controllers e, a partir de F2, os módulos de domínio e
 * o `APP_GUARD`. Controller não mora em módulo de domínio — regra e transporte
 * não se misturam.
 *
 * Importa o **módulo** de autenticação, nunca os tokens de repositório dele: a
 * fronteira do agregado é o que o módulo exporta.
 */
@Module({
  imports: [AuthenticationModule],
  controllers: [HealthController, AuthenticateDoctorController],
  providers: [{ provide: APP_PIPE, useClass: ZodValidationPipe }],
})
export class HttpModule {}
