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
 * O mínimo que outro módulo precisa saber sobre um paciente: que ele existe, que é
 * do médico certo, como se chama, e se ainda aceita operação — `isAnonymized` é o
 * que o agendamento consulta para recusar consulta nova a quem pediu esquecimento.
 * (INV-02)
 */
export interface PatientSummary {
  id: string;
  name: string;
  isAnonymized: boolean;
}

export type FindPatientSummaryResult = Either<ResourceNotFoundError, PatientSummary>;

/**
 * **A porta pública do módulo de pacientes** — a única forma de outro módulo
 * perguntar alguma coisa sobre um paciente.
 *
 * Quem usa: o agendamento. Antes de marcar uma consulta ele precisa saber se o
 * paciente existe, se é deste médico e se ainda aceita operação. Pergunta aqui, e
 * não no repositório de pacientes nem com um `JOIN` na tabela `patients` — os dois
 * atalhos furam a fronteira entre os módulos, e são difíceis de desfazer depois de
 * escritos.
 *
 * Devolve um resumo, não o paciente inteiro: quem está do outro lado da fronteira
 * não precisa de telefone, email nem data de nascimento para marcar uma consulta.
 *
 * Mais detalhes: PRODUCT.md — §dominios, INV-02, INV-04.
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
