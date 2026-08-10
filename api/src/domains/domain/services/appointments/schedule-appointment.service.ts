import { Inject, Injectable } from '@nestjs/common';

import { APPOINTMENTS_REPOSITORY } from '@/shared/constants/repositories';
import { Either, left, right } from '@/shared/errors/either';
import {
  BusinessRuleViolationError,
  ResourceNotFoundError,
  ScheduleConflictError,
} from '@/shared/errors/types';

import { Appointment, AppointmentStatus } from '../../model-entities/appointment.entity';
import { AppointmentRepository } from '../../repositories/appointment.repository';
import { FindPatientSummaryService } from '../patients/find-patient-summary.service';

export interface ScheduleAppointmentRequest {
  doctorId: string;
  patientId: string;
  scheduledAt: Date;
}

export type ScheduleAppointmentResult = Either<
  ResourceNotFoundError | BusinessRuleViolationError | ScheduleConflictError,
  Appointment
>;

/**
 * O texto do 409. Fica exportado porque o reagendamento recusa pelo mesmo motivo e
 * precisa dizer a mesma coisa — duas cópias divergiriam no dia em que alguém
 * editasse uma. (INV-01)
 */
export const SCHEDULE_CONFLICT_MESSAGE = 'Já existe um agendamento neste horário.';

/** O texto do 422 de paciente anonimizado por pedido de LGPD. (INV-02) */
const ANONYMIZED_PATIENT_MESSAGE =
  'Paciente anonimizado (LGPD) não pode receber novos agendamentos.';

/**
 * Marca uma consulta — o caso de uso que carrega a regra central do sistema.
 *
 * Três perguntas, nesta ordem, e qualquer "não" encerra:
 *   1. este paciente é deste médico?  → senão, 404
 *   2. ele foi anonimizado por LGPD?  → se sim, 422
 *   3. o horário está livre?          → senão, 409
 *
 * O dado do paciente vem do **service público do módulo de pacientes**, nunca do
 * repositório de lá nem de um `JOIN` na tabela `patients`. Isso não é cerimônia de
 * arquitetura: aquele service já filtra por médico, então "paciente de outro
 * consultório" chega aqui como 404 sem esta classe precisar conhecer a regra de
 * isolamento por médico. A separação faz o trabalho sozinha.
 *
 * Atende RF-03. Mais detalhes: PRODUCT.md — INV-01, INV-02, INV-04 · §dominios.
 */
@Injectable()
export class ScheduleAppointmentService {
  constructor(
    @Inject(APPOINTMENTS_REPOSITORY)
    private readonly appointmentRepository: AppointmentRepository,
    private readonly findPatientSummary: FindPatientSummaryService,
  ) {}

  async execute({
    doctorId,
    patientId,
    scheduledAt,
  }: ScheduleAppointmentRequest): Promise<ScheduleAppointmentResult> {
    const patient = await this.findPatientSummary.execute({ doctorId, patientId });

    // Repassa o 404 do outro módulo em vez de inventar um próprio: a mensagem
    // "Paciente não encontrado." é de lá, e vale igual para paciente inexistente e
    // para paciente de outro consultório.
    if (patient.isLeft()) {
      return left(patient.value);
    }

    // Paciente que exerceu o direito ao esquecimento não recebe consulta nova. Não
    // é bloqueio técnico: agendar exigiria saber quem ele é, e é exatamente isso
    // que foi apagado a pedido dele.
    if (patient.value.isAnonymized) {
      return left(new BusinessRuleViolationError(ANONYMIZED_PATIENT_MESSAGE));
    }

    // Primeira das duas camadas que protegem o horário. Esta aqui é a que dá o 409
    // com mensagem legível no caso normal.
    //
    // A segunda camada é uma restrição do próprio banco, e ela existe porque esta
    // verificação tem um buraco intransponível: duas requisições simultâneas podem
    // passar as duas por aqui antes de qualquer uma gravar. O banco recusa a
    // segunda gravação de qualquer jeito.
    const conflict = await this.appointmentRepository.findActiveBySlot(doctorId, scheduledAt);

    if (conflict) {
      return left(new ScheduleConflictError(SCHEDULE_CONFLICT_MESSAGE));
    }

    const appointment = Object.assign(new Appointment(), {
      doctorId,
      patientId,
      scheduledAt,
      status: AppointmentStatus.SCHEDULED,
    });

    return right(await this.appointmentRepository.create(appointment));
  }
}
