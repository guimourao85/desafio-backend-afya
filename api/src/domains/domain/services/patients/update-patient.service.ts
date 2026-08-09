import { Inject, Injectable } from '@nestjs/common';

import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';
import { Either, left, right } from '@/shared/errors/either';
import { BusinessRuleViolationError, ResourceNotFoundError } from '@/shared/errors/types';

import { Patient, PatientSex } from '../../model-entities/patient.entity';
import { PatientRepository } from '../../repositories/patient.repository';
import { PATIENT_NOT_FOUND_MESSAGE } from './get-patient.service';

export interface UpdatePatientRequest {
  doctorId: string;
  patientId: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  sex?: PatientSex | null;
  heightM?: number | null;
  weightKg?: number | null;
}

export type UpdatePatientResult = Either<
  ResourceNotFoundError | BusinessRuleViolationError,
  Patient
>;

/** INV-02: anonimizado é registro contábil, não perfil ativo. */
const ANONYMIZED_PATIENT_MESSAGE = 'Paciente anonimizado (LGPD) não pode ser editado.';

/**
 * Corrige o perfil de um paciente (RF-02).
 *
 * `PATCH` de verdade: só os campos presentes mudam. A diferença entre "não veio" e
 * "veio nulo" é significativa aqui — `phone: null` **apaga** o telefone, enquanto a
 * ausência de `phone` o deixa como está. Por isso a checagem é `!== undefined`, e
 * não um `??` que confundiria os dois.
 */
@Injectable()
export class UpdatePatientService {
  constructor(
    @Inject(PATIENTS_REPOSITORY)
    private readonly patientRepository: PatientRepository,
  ) {}

  async execute({
    doctorId,
    patientId,
    ...changes
  }: UpdatePatientRequest): Promise<UpdatePatientResult> {
    const patient = await this.patientRepository.findByIdForDoctor(patientId, doctorId);

    if (!patient) {
      return left(new ResourceNotFoundError(PATIENT_NOT_FOUND_MESSAGE));
    }

    if (patient.isAnonymized()) {
      // 422 e não 404: o recurso existe, e a recusa é de regra de negócio. Aceitar
      // a edição reintroduziria PII pela porta dos fundos, desfazendo o direito ao
      // esquecimento que alguém exerceu.
      return left(new BusinessRuleViolationError(ANONYMIZED_PATIENT_MESSAGE));
    }

    if (changes.name !== undefined) patient.name = changes.name;
    if (changes.phone !== undefined) patient.phone = changes.phone;
    if (changes.email !== undefined) patient.email = changes.email;
    if (changes.birthDate !== undefined) patient.birthDate = changes.birthDate;
    if (changes.sex !== undefined) patient.sex = changes.sex;
    if (changes.heightM !== undefined) patient.heightM = changes.heightM;
    if (changes.weightKg !== undefined) patient.weightKg = changes.weightKg;

    return right(await this.patientRepository.save(patient, doctorId));
  }
}
