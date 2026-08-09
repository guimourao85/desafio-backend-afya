import { Inject, Injectable } from '@nestjs/common';

import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';
import { Either, left, right } from '@/shared/errors/either';
import { ResourceNotFoundError } from '@/shared/errors/types';

import { Patient } from '../../model-entities/patient.entity';
import { PatientRepository } from '../../repositories/patient.repository';

export interface GetPatientRequest {
  doctorId: string;
  patientId: string;
}

export type GetPatientResult = Either<ResourceNotFoundError, Patient>;

/**
 * O texto é o mesmo para "não existe" e para "é de outro médico" — e é o mesmo 404.
 * Responder 403 no segundo caso confirmaria que o recurso existe e vazaria a base de
 * outro consultório: a ausência é indistinguível da falta de permissão, de propósito
 * (INV-04).
 */
export const PATIENT_NOT_FOUND_MESSAGE = 'Paciente não encontrado.';

/** Consulta o perfil de um paciente do médico autenticado. */
@Injectable()
export class GetPatientService {
  constructor(
    @Inject(PATIENTS_REPOSITORY)
    private readonly patientRepository: PatientRepository,
  ) {}

  async execute({ doctorId, patientId }: GetPatientRequest): Promise<GetPatientResult> {
    const patient = await this.patientRepository.findByIdForDoctor(patientId, doctorId);

    if (!patient) {
      return left(new ResourceNotFoundError(PATIENT_NOT_FOUND_MESSAGE));
    }

    return right(patient);
  }
}
