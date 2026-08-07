import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';

import { databaseProviders } from './database.providers';

/**
 * `@Global` porque conexão é infraestrutura transversal: importar este módulo em
 * cada módulo de domínio seria ruído sem fronteira real — a fronteira que importa
 * é a do agregado.
 */
@Global()
@Module({
  providers: [...databaseProviders],
  exports: [...databaseProviders],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(
    @Inject(PRONTOMED_POSTGRES_DATA_SOURCE) private readonly dataSource: DataSource,
  ) {}

  // O `DataSource` vem de `useFactory`: o Nest sabe construí-lo, mas não sabe que
  // `destroy()` é o fim dele. Sem isto o pool sobrevive ao `app.close()`.
  async onModuleDestroy(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }
}
