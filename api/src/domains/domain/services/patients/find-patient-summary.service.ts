import { Inject, Injectable } from '@nestjs/common';

import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';
import { Either, left, right } from '@/shared/errors/either';
import { ResourceNotFoundError } from '@/shared/errors/types';

import { PatientRepository } from '../../repositories/patient.repository';
import { PATIENT_NOT_FOUND_MESSAGE } from './get-patient.service';

export interface FindPatientSummaryRequest {
  doctorId: string;
  patientId: string;
}

/**
 * O mínimo que outro módulo precisa saber sobre um paciente: que ele existe, é do
 * médico certo, como se chama e se ainda aceita operação (INV-02).
 */
export interface PatientSummary {
  id: string;
  name: string;
  isAnonymized: boolean;
}

export type FindPatientSummaryResult = Either<ResourceNotFoundError, PatientSummary>;

/**
 * **A API pública do `PatientsModule`** — a única porta pela qual outro módulo
 * pergunta sobre um paciente (PRODUCT.md §dominios).
 *
 * Nasce nesta sprint mesmo sem consumidor: em F4, `AppointmentsModule` precisa saber
 * se o paciente existe e está ativo antes de agendar. Se este service só nascesse
 * lá, a saída fácil seria injetar `PATIENTS_REPOSITORY` ou dar um `JOIN` em
 * `patients` — os dois furam a fronteira do agregado, e os dois são difíceis de
 * desfazer depois. A fronteira nasce antes da pressão que a testaria.
 *
 * Devolve `PatientSummary`, não a entity: quem está do outro lado da fronteira não
 * precisa de telefone, email nem nascimento para agendar uma consulta.
 */
@Injectable()
export class FindPatientSummaryService {
  constructor(
    @Inject(PATIENTS_REPOSITORY)
    private readonly patientRepository: PatientRepository,
  ) {}

  async execute({
    doctorId,
    patientId,
  }: FindPatientSummaryRequest): Promise<FindPatientSummaryResult> {
    const patient = await this.patientRepository.findByIdForDoctor(patientId, doctorId);

    if (!patient) {
      return left(new ResourceNotFoundError(PATIENT_NOT_FOUND_MESSAGE));
    }

    return right({
      id: patient.id,
      name: patient.name,
      isAnonymized: patient.isAnonymized(),
    });
  }
}
