import { DataSource, Repository } from 'typeorm';

import { Doctor } from '@/domains/domain/model-entities/doctor.entity';
import { DoctorRepository } from '@/domains/domain/repositories/doctor.repository';

/**
 * O adapter TypeORM da porta de médico. É esta classe — não o `Repository<Doctor>`
 * cru — que o container entrega sob `DOCTORS_REPOSITORY` (ADR-02): expor o
 * repositório do ORM daria ao caso de uso a API inteira do TypeORM, e a porta
 * deixaria de restringir coisa alguma.
 */
export class TypeOrmDoctorRepository implements DoctorRepository {
  private readonly repository: Repository<Doctor>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(Doctor);
  }

  findByEmail(email: string): Promise<Doctor | null> {
    return this.repository.findOne({ where: { email } });
  }
}
