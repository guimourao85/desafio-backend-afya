import { Provider } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { TypeOrmAppointmentRepository } from '@/infrastructure/databases/typeorm/postgres/repositories/typeorm-appointment.repository';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { APPOINTMENTS_REPOSITORY } from '@/shared/constants/repositories';

export const appointmentsProviders: Provider[] = [
  {
    provide: APPOINTMENTS_REPOSITORY,
    inject: [PRONTOMED_POSTGRES_DATA_SOURCE],
    useFactory: (dataSource: DataSource): TypeOrmAppointmentRepository =>
      new TypeOrmAppointmentRepository(dataSource),
  },
];
