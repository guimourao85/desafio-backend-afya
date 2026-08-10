import { Global, Module } from '@nestjs/common';

import { EnvironmentService } from './environment.service';

/**
 * `@Global` porque toda variável de ambiente é lida através deste módulo — nenhum
 * outro precisa reimportá-lo para alcançar `EnvironmentService`.
 */
@Global()
@Module({
  providers: [EnvironmentService],
  exports: [EnvironmentService],
})
export class EnvironmentModule {}
