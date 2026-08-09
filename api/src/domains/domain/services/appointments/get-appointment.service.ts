import { Inject, Injectable } from '@nestjs/common';

import { APPOINTMENTS_REPOSITORY } from '@/shared/constants/repositories';
import { Either, left, right } from '@/shared/errors/either';
import { ResourceNotFoundError } from '@/shared/errors/types';

import { Appointment } from '../../model-entities/appointment.entity';
import { AppointmentRepository } from '../../repositories/appointment.repository';

export interface GetAppointmentRequest {
  doctorId: string;
  appointmentId: string;
}

export type GetAppointmentResult = Either<ResourceNotFoundError, Appointment>;

/** Mesmo texto para inexistente e para alheio — INV-04. */
export const APPOINTMENT_NOT_FOUND_MESSAGE = 'Agendamento não encontrado.';

@Injectable()
export class GetAppointmentService {
  constructor(
    @Inject(APPOINTMENTS_REPOSITORY)
    private readonly appointmentRepository: AppointmentRepository,
  ) {}

  async execute({
    doctorId,
    appointmentId,
  }: GetAppointmentRequest): Promise<GetAppointmentResult> {
    const appointment = await this.appointmentRepository.findByIdForDoctor(appointmentId, doctorId);

    if (!appointment) {
      return left(new ResourceNotFoundError(APPOINTMENT_NOT_FOUND_MESSAGE));
    }

    return right(appointment);
  }
}
