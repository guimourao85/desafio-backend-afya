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
 * Exerce o direito ao esquecimento (LGPD) — o "excluir paciente" que não apaga.
 *
 * Apagar a linha destruiria a trilha de atendimento e colidiria com o próprio
 * direito que se está exercendo: a lei pede que o dado **pessoal** suma, não que o
 * histórico clínico deixe de ter acontecido. Saem os campos que identificam; a
 * linha e toda a agenda ficam.
 *
 * **Idempotente:** anonimizar de novo responde 204 e não reescreve a data. Quem
 * garante isso é a própria entidade, que sai cedo se já estiver anonimizada —
 * *quando* o direito foi exercido é dado de conformidade, e não muda porque a rede
 * repetiu a requisição.
 *
 * O detalhe que mais importa: este caso de uso **não toca nenhuma outra tabela**. É
 * o que torna "anonimizar preserva o histórico" verdade por construção em vez de
 * por promessa — não existe linha daqui que alcance a agenda.
 *
 * Atende RF-08. Mais detalhes: PRODUCT.md — INV-03.
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

    // O instante entra por parâmetro, em vez de a entidade chamar `new Date()` por
    // conta própria: assim o teste controla o relógio sem precisar congelar o tempo
    // do processo inteiro.
    //
    // Quem decide o que se apaga e o que se preserva é a entidade, não este método.
    patient.anonymize(new Date());

    await this.patientRepository.save(patient, doctorId);

    return right(undefined);
  }
}
