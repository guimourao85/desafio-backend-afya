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
import { APPOINTMENT_NOT_FOUND_MESSAGE } from './get-appointment.service';
import { SCHEDULE_CONFLICT_MESSAGE } from './schedule-appointment.service';

export interface UpdateAppointmentRequest {
  doctorId: string;
  appointmentId: string;
  scheduledAt?: Date;
  /** Só `COMPLETED`: cancelar é `DELETE`, e consulta concluída não "desconclui". */
  status?: AppointmentStatus.COMPLETED;
}

export type UpdateAppointmentResult = Either<
  ResourceNotFoundError | BusinessRuleViolationError | ScheduleConflictError,
  Appointment
>;

/**
 * Reagenda e/ou conclui uma consulta (RF-04).
 *
 * **Um service para um `PATCH`**, e não um para reagendar e outro para concluir: o
 * contrato de `PLAN.md §9.2` funde as duas operações numa requisição só. Dois
 * services fariam o controller escolher qual chamar olhando o payload — regra de
 * negócio migrando para o transporte — ou escreveriam duas vezes no mesmo agregado.
 *
 * A orquestração é daqui; os **guardas de estado** são da entity. Este método
 * decide a ordem e conversa com a porta; ele não sabe quais transições existem.
 */
@Injectable()
export class UpdateAppointmentService {
  constructor(
    @Inject(APPOINTMENTS_REPOSITORY)
    private readonly appointmentRepository: AppointmentRepository,
  ) {}

  async execute({
    doctorId,
    appointmentId,
    scheduledAt,
    status,
  }: UpdateAppointmentRequest): Promise<UpdateAppointmentResult> {
    const appointment = await this.appointmentRepository.findByIdForDoctor(appointmentId, doctorId);

    if (!appointment) {
      return left(new ResourceNotFoundError(APPOINTMENT_NOT_FOUND_MESSAGE));
    }

    if (scheduledAt) {
      // Conflito **antes** de mexer no estado: uma requisição que vai ser recusada
      // não pode deixar rastro. `appointment.id` sai da busca para a consulta não
      // conflitar consigo mesma ao ser movida para onde já está.
      const conflict = await this.appointmentRepository.findActiveBySlot(
        doctorId,
        scheduledAt,
        appointment.id,
      );

      if (conflict) {
        return left(new ScheduleConflictError(SCHEDULE_CONFLICT_MESSAGE));
      }

      const rescheduled = appointment.rescheduleTo(scheduledAt);

      if (rescheduled.isLeft()) {
        return left(rescheduled.value);
      }
    }

    if (status === AppointmentStatus.COMPLETED) {
      const completed = appointment.complete();

      if (completed.isLeft()) {
        return left(completed.value);
      }
    }

    return right(await this.appointmentRepository.save(appointment, doctorId));
  }
}
