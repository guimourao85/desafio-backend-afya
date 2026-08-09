import { Inject, Injectable } from '@nestjs/common';

import { APPOINTMENTS_REPOSITORY } from '@/shared/constants/repositories';
import { Either, left, right } from '@/shared/errors/either';
import { BusinessRuleViolationError, ResourceNotFoundError } from '@/shared/errors/types';

import { AppointmentStatus } from '../../model-entities/appointment.entity';
import { AppointmentRepository } from '../../repositories/appointment.repository';
import { APPOINTMENT_NOT_FOUND_MESSAGE } from './get-appointment.service';

export interface CancelAppointmentRequest {
  doctorId: string;
  appointmentId: string;
}

export type CancelAppointmentResult = Either<
  ResourceNotFoundError | BusinessRuleViolationError,
  void
>;

/**
 * Cancela a consulta (RF-04) — o `DELETE` que não apaga.
 *
 * A linha permanece e o status vira `CANCELLED`. Apagar destruiria a trilha de
 * atendimento, e liberaria o horário por **remoção** em vez de por regra — o índice
 * parcial já faz isso, e faz de um jeito que continua contando o que aconteceu.
 */
@Injectable()
export class CancelAppointmentService {
  constructor(
    @Inject(APPOINTMENTS_REPOSITORY)
    private readonly appointmentRepository: AppointmentRepository,
  ) {}

  async execute({
    doctorId,
    appointmentId,
  }: CancelAppointmentRequest): Promise<CancelAppointmentResult> {
    const appointment = await this.appointmentRepository.findByIdForDoctor(appointmentId, doctorId);

    if (!appointment) {
      return left(new ResourceNotFoundError(APPOINTMENT_NOT_FOUND_MESSAGE));
    }

    // Já cancelada: sai sem escrever. O 204 é o mesmo, e a ida ao banco não teria
    // efeito nenhum além de mexer em `updated_at`.
    if (appointment.status === AppointmentStatus.CANCELLED) {
      return right(undefined);
    }

    const cancelled = appointment.cancel();

    // O único `Left` que sobra é o da consulta **concluída** — cancelar o que já foi
    // atendido apagaria o registro de que o atendimento aconteceu.
    if (cancelled.isLeft()) {
      return left(cancelled.value);
    }

    await this.appointmentRepository.save(appointment, doctorId);

    return right(undefined);
  }
}
