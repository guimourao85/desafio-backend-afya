import { Provider } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { TypeOrmDoctorRepository } from '@/infrastructure/databases/typeorm/postgres/repositories/typeorm-doctor.repository';
import { TypeOrmRefreshTokenRepository } from '@/infrastructure/databases/typeorm/postgres/repositories/typeorm-refresh-token.repository';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { DOCTORS_REPOSITORY, REFRESH_TOKENS_REPOSITORY } from '@/shared/constants/repositories';

/**
 * O ponto onde o contrato encontra a implementação.
 *
 * Cada token entrega a classe que fala com o Postgres, amarrada ao **contrato** e
 * não ao TypeORM: nenhum caso de uso enxerga o ORM. Trocar Postgres por outra coisa
 * é reescrever este arquivo e os adapters, e mais nada.
 *
 * Mora junto dos services, e não na pasta de infraestrutura, porque quem declara de
 * que implementação precisa é o módulo de domínio. A infraestrutura só a oferece.
 *
 * Mais detalhes: PRODUCT.md — ADR-02.
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
