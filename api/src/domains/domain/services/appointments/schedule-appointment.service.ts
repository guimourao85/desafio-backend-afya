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

/** INV-01. O texto é o de `PRODUCT.md §regras`. */
export const SCHEDULE_CONFLICT_MESSAGE = 'Já existe um agendamento neste horário.';

/** INV-02, texto de `PRODUCT.md §regras`. */
const ANONYMIZED_PATIENT_MESSAGE =
  'Paciente anonimizado (LGPD) não pode receber novos agendamentos.';

/**
 * Marca uma consulta (RF-03) — o caso de uso que carrega a regra central do sistema.
 *
 * O dado do paciente vem do **service público do `PatientsModule`**, nunca do
 * repositório dele nem de um `JOIN` (`PRODUCT.md §dominios`). O ganho não é
 * cerimônia: `FindPatientSummaryService` já filtra por médico, então "paciente de
 * outro consultório" chega aqui como 404 sem esta classe precisar saber que INV-04
 * existe.
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

    // Propaga o 404 do outro módulo em vez de inventar um: a mensagem "Paciente
    // não encontrado." é de lá, e vale igual para inexistente e para alheio.
    if (patient.isLeft()) {
      return left(patient.value);
    }

    if (patient.value.isAnonymized) {
      return left(new BusinessRuleViolationError(ANONYMIZED_PATIENT_MESSAGE));
    }

    // INV-01, primeira camada: dá o 409 com mensagem humana no caso comum. A
    // segunda camada é o índice único parcial, que pega o que esta verificação
    // não pode pegar — duas requisições simultâneas passam as duas por aqui.
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
