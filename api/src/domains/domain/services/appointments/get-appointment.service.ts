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

/**
 * Um texto só para dois casos diferentes: "não existe" e "existe, mas é de outro
 * médico". Textos distintos deixariam o cliente separar os dois — e separar já
 * confirma que aquele id é de um registro real no consultório vizinho. (INV-04)
 */
export const APPOINTMENT_NOT_FOUND_MESSAGE = 'Agendamento não encontrado.';

/**
 * Abre uma consulta pelo id, dentro da agenda do médico autenticado — e é a
 * **única** leitura de agendamento que traz as anotações junto.
 *
 * Não existe um `GET /appointments/:id/notes` separado porque esta rota já é o
 * lugar onde a anotação naturalmente aparece: quem abre a consulta quer ver o que
 * foi escrito nela.
 *
 * A busca no banco já vai filtrada pelo médico do token, então consulta alheia nem
 * chega a ser lida. Não é um `if` de permissão depois de encontrar: é uma busca que
 * nunca encontra.
 *
 * Mais detalhes: PRODUCT.md — INV-04.
 */
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
    const appointment = await this.appointmentRepository.findByIdWithNotes(appointmentId, doctorId);

    if (!appointment) {
      return left(new ResourceNotFoundError(APPOINTMENT_NOT_FOUND_MESSAGE));
    }

    return right(appointment);
  }
}
