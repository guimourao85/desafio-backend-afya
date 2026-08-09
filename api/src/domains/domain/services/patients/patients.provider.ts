import { Provider } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { TypeOrmPatientRepository } from '@/infrastructure/databases/typeorm/postgres/repositories/typeorm-patient.repository';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';

/**
 * O ponto onde porta e adapter se encontram (ADR-02). Vive ao lado dos services
 * porque é o **módulo de domínio** que declara de que implementação precisa — a
 * infraestrutura só a oferece.
 */
export const patientsProviders: Provider[] = [
  {
    provide: PATIENTS_REPOSITORY,
    inject: [PRONTOMED_POSTGRES_DATA_SOURCE],
    useFactory: (dataSource: DataSource): TypeOrmPatientRepository =>
      new TypeOrmPatientRepository(dataSource),
  },
];
