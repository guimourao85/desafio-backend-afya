import { Provider } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { TypeOrmAppointmentRepository } from '@/infrastructure/databases/typeorm/postgres/repositories/typeorm-appointment.repository';
import { PRONTOMED_POSTGRES_DATA_SOURCE } from '@/shared/constants';
import { APPOINTMENTS_REPOSITORY } from '@/shared/constants/repositories';

/**
 * O ponto onde o contrato encontra a implementação.
 *
 * Quem pede `APPOINTMENTS_REPOSITORY` recebe a classe que fala com o Postgres — mas
 * recebe amarrado ao **contrato**, não ao TypeORM. Nenhum caso de uso enxerga o
 * ORM: eles conhecem só os métodos declarados na porta, e trocar Postgres por outra
 * coisa é reescrever este arquivo e o adapter, mais nada.
 *
 * Mora junto dos services, e não na pasta de infraestrutura, porque quem declara de
 * que implementação precisa é o módulo de domínio. A infraestrutura só a oferece.
 *
 * Mais detalhes: PRODUCT.md — ADR-02.
 */
export const appointmentsProviders: Provider[] = [
  {
    provide: APPOINTMENTS_REPOSITORY,
    inject: [PRONTOMED_POSTGRES_DATA_SOURCE],
    useFactory: (dataSource: DataSource): TypeOrmAppointmentRepository =>
      new TypeOrmAppointmentRepository(dataSource),
  },
];
