import { Provider } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { TypeOrmDoctorRepository } from '@/infrastructure/databases/typeorm/postgres/repositories/typeorm-doctor.repository';
import { TypeOrmRefreshTokenRepository } from '@/infrastructure/databases/typeorm/postgres/repositories/typeorm-refresh-token.repository';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { DOCTORS_REPOSITORY, REFRESH_TOKENS_REPOSITORY } from '@/shared/constants/repositories';

/**
 * O ponto onde porta e adapter se encontram (ADR-02). Vive ao lado dos services, e
 * não em `infrastructure/`, porque é o **módulo de domínio** que declara de que
 * implementação precisa — a infraestrutura só a oferece.
 *
 * Cada token entrega o adapter, nunca o `Repository<T>` do TypeORM: trocar Postgres
 * por outra coisa é reescrever estes dois arquivos, e mais nada.
 */
export const authenticationProviders: Provider[] = [
  {
    provide: DOCTORS_REPOSITORY,
    inject: [PRONTOMED_POSTGRES_DATA_SOURCE],
    useFactory: (dataSource: DataSource): TypeOrmDoctorRepository =>
      new TypeOrmDoctorRepository(dataSource),
  },
  {
    provide: REFRESH_TOKENS_REPOSITORY,
    inject: [PRONTOMED_POSTGRES_DATA_SOURCE],
    useFactory: (dataSource: DataSource): TypeOrmRefreshTokenRepository =>
      new TypeOrmRefreshTokenRepository(dataSource),
  },
];
