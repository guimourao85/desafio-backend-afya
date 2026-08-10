import { Provider } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { TypeOrmPatientRepository } from '@/infrastructure/databases/typeorm/postgres/repositories/typeorm-patient.repository';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';

/**
 * O ponto onde o contrato encontra a implementação.
 *
 * Quem pede `PATIENTS_REPOSITORY` recebe a classe que fala com o Postgres — mas
 * amarrada ao **contrato**, não ao TypeORM. Nenhum caso de uso enxerga o ORM: eles
 * conhecem só os métodos declarados na porta.
 *
 * Mora junto dos services, e não na pasta de infraestrutura, porque quem declara de
 * que implementação precisa é o módulo de domínio. A infraestrutura só a oferece.
 *
 * Mais detalhes: PRODUCT.md — ADR-02.
 */
export const patientsProviders: Provider[] = [
  {
    provide: PATIENTS_REPOSITORY,
    inject: [PRONTOMED_POSTGRES_DATA_SOURCE],
    useFactory: (dataSource: DataSource): TypeOrmPatientRepository =>
      new TypeOrmPatientRepository(dataSource),
  },
];
