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
 * O mesmo texto para dois casos diferentes: "não existe" e "existe, mas é de outro
 * médico". E o mesmo 404 nos dois.
 *
 * Responder 403 no segundo caso seria mais honesto sobre o que aconteceu, e é
 * justamente por isso que está errado: confirmaria que aquele id é de um paciente
 * real, entregando a base do consultório vizinho para quem só tinha um palpite. A
 * ausência é indistinguível da falta de permissão, de propósito. (INV-04)
 */
export const PATIENT_NOT_FOUND_MESSAGE = 'Paciente não encontrado.';

/**
 * Abre a ficha de um paciente da base do médico autenticado.
 *
 * A busca no banco já vai filtrada pelo médico do token, então paciente alheio nem
 * chega a ser lido. Não é um `if` de permissão depois de encontrar: é uma busca que
 * nunca encontra.
 *
 * Mais detalhes: PRODUCT.md — INV-04.
 */
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
