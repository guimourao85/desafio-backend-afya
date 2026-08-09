import { Inject, Injectable } from '@nestjs/common';

import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';
import { Either, left, right } from '@/shared/errors/either';
import { ResourceNotFoundError } from '@/shared/errors/types';

import { PatientRepository } from '../../repositories/patient.repository';
import { PATIENT_NOT_FOUND_MESSAGE } from './get-patient.service';

export interface AnonymizePatientRequest {
  doctorId: string;
  patientId: string;
}

export type AnonymizePatientResult = Either<ResourceNotFoundError, void>;

/**
 * Exerce o direito ao esquecimento (RF-08).
 *
 * **`DELETE` que não apaga.** Apagar a linha destruiria a trilha de atendimento e
 * colidiria com o próprio direito que se está exercendo — a LGPD pede que o dado
 * pessoal suma, não que o histórico clínico deixe de existir. O que sai são os
 * campos que identificam; a linha e toda a agenda permanecem (INV-03).
 *
 * **Idempotente:** anonimizar de novo responde 204 e não reescreve `anonymized_at`.
 * A regra vive na entity, que sai cedo se já anonimizada — quando o direito foi
 * exercido é dado de conformidade, e não muda porque a rede repetiu a requisição.
 *
 * Este caso de uso **não toca outra tabela**. É o que faz INV-03 ser verdade por
 * construção, e não por promessa: nenhuma linha daqui alcança `appointments`.
 */
@Injectable()
export class AnonymizePatientService {
  constructor(
    @Inject(PATIENTS_REPOSITORY)
    private readonly patientRepository: PatientRepository,
  ) {}

  async execute({ doctorId, patientId }: AnonymizePatientRequest): Promise<AnonymizePatientResult> {
    const patient = await this.patientRepository.findByIdForDoctor(patientId, doctorId);

    if (!patient) {
      return left(new ResourceNotFoundError(PATIENT_NOT_FOUND_MESSAGE));
    }

    // O instante vem de fora da entity: assim o teste controla o relógio sem
    // precisar de fake timer sobre o módulo inteiro.
    patient.anonymize(new Date());

    await this.patientRepository.save(patient, doctorId);

    return right(undefined);
  }
}
