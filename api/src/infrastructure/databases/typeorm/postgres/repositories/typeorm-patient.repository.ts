import { DataSource, Repository } from 'typeorm';

import { Patient } from '@/domains/domain/model-entities/patient.entity';
import {
  ListPatientsFilters,
  PatientPage,
  PatientRepository,
} from '@/domains/domain/repositories/patient.repository';

/**
 * O adapter TypeORM da porta de paciente.
 *
 * **Toda** query desta classe carrega `doctor_id` no `where`. O filtro vive aqui, e
 * não numa comparação em JS depois de buscar, por duas razões: comparar depois já
 * leu a linha alheia — basta um log de debug para expô-la —, e uma listagem
 * filtrada em memória pagina errado, porque `total` e `LIMIT` teriam sido calculados
 * sobre o conjunto de todo mundo.
 */
export class TypeOrmPatientRepository implements PatientRepository {
  private readonly repository: Repository<Patient>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(Patient);
  }

  create(patient: Patient): Promise<Patient> {
    // `save` e não `insert`: aqui o retorno **é** o resultado — a resposta 201
    // precisa do `id` e dos carimbos que o banco gerou.
    return this.repository.save(patient);
  }

  async save(patient: Patient, doctorId: string): Promise<Patient> {
    // Defesa em profundidade: a entity veio de `findByIdForDoctor` e já está
    // escopada, mas isso é disciplina de quem chamou. O `where` composto faz o
    // banco recusar a escrita alheia mesmo se o caso de uso errar.
    await this.repository.update({ id: patient.id, doctorId }, this.toUpdatePayload(patient));

    return patient;
  }

  findByIdForDoctor(id: string, doctorId: string): Promise<Patient | null> {
    return this.repository.findOne({ where: { id, doctorId } });
  }

  async list({ doctorId, search, page, perPage }: ListPatientsFilters): Promise<PatientPage> {
    const query = this.repository
      .createQueryBuilder('patient')
      .where('patient.doctorId = :doctorId', { doctorId });

    if (search) {
      // `ILIKE` para ignorar caixa. Acento **não** é ignorado — limite declarado na
      // sprint: `unaccent` exigiria extensão e índice para uma base de dezenas.
      query.andWhere('patient.name ILIKE :search', { search: `%${search}%` });
    }

    // `ORDER BY` explícito: sem ele o Postgres não promete ordem, e a página 2
    // poderia repetir uma linha da página 1.
    const [items, total] = await query
      .orderBy('patient.name', 'ASC')
      .addOrderBy('patient.id', 'ASC')
      .skip((page - 1) * perPage)
      .take(perPage)
      .getManyAndCount();

    return { items, total };
  }

  /**
   * Só as colunas que o `PATCH` pode alterar. `id`, `doctorId` e os carimbos ficam
   * de fora de propósito: mandar a entity inteira para o `update` abriria o caminho
   * de reescrever o dono da linha.
   */
  private toUpdatePayload(patient: Patient): Partial<Patient> {
    return {
      name: patient.name,
      phone: patient.phone,
      email: patient.email,
      birthDate: patient.birthDate,
      sex: patient.sex,
      heightM: patient.heightM,
      weightKg: patient.weightKg,
      anonymizedAt: patient.anonymizedAt,
    };
  }
}
