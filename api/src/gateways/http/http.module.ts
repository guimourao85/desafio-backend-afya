import { Module } from '@nestjs/common';

import { HealthController } from './controllers/core';

/**
 * Concentra o transporte: controllers e, a partir de F1/F2, os módulos de domínio
 * e os providers globais (`APP_PIPE`, `APP_GUARD`). Controller não mora em módulo
 * de domínio — regra e transporte não se misturam.
 */
@Module({
  controllers: [HealthController],
})
export class HttpModule {}
