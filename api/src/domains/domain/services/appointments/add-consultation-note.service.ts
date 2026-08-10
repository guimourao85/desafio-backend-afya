import { Inject, Injectable } from '@nestjs/common';

import { APPOINTMENTS_REPOSITORY } from '@/shared/constants/repositories';
import { Either, left, right } from '@/shared/errors/either';
import { BusinessRuleViolationError, ResourceNotFoundError } from '@/shared/errors/types';

import { ConsultationNote } from '../../model-entities/consultation-note.entity';
import { AppointmentRepository } from '../../repositories/appointment.repository';
import { APPOINTMENT_NOT_FOUND_MESSAGE } from './get-appointment.service';

export interface AddConsultationNoteRequest {
  doctorId: string;
  appointmentId: string;
  content: string;
}

export type AddConsultationNoteResult = Either<
  ResourceNotFoundError | BusinessRuleViolationError,
  ConsultationNote
>;

/**
 * Registra o que aconteceu no atendimento (RF-05) — o caso de uso que transforma o
 * agendamento em prontuário.
 *
 * Três passos e nenhuma regra própria: carrega a raiz **escopada**, pede a ela que
 * crie a nota, persiste o agregado. A decisão de aceitar ou recusar é da entity
 * (INV-05), e é lá porque é regra sobre o próprio estado da consulta — se morasse
 * aqui, qualquer caminho futuro que criasse nota precisaria lembrar dela.
 *
 * O 404 do `findByIdForDoctor` cobre as duas ausências que INV-04 quer
 * indistinguíveis: consulta inexistente e consulta de outro médico.
 */
@Injectable()
export class AddConsultationNoteService {
  constructor(
    @Inject(APPOINTMENTS_REPOSITORY)
    private readonly appointmentRepository: AppointmentRepository,
  ) {}

  async execute({
    doctorId,
    appointmentId,
    content,
  }: AddConsultationNoteRequest): Promise<AddConsultationNoteResult> {
    const appointment = await this.appointmentRepository.findByIdForDoctor(appointmentId, doctorId);

    if (!appointment) {
      return left(new ResourceNotFoundError(APPOINTMENT_NOT_FOUND_MESSAGE));
    }

    const note = appointment.addNote(content);

    // Recusa **antes** de qualquer escrita: uma requisição que vai levar 422 não
    // pode deixar rastro no banco.
    if (note.isLeft()) {
      return left(note.value);
    }

    await this.appointmentRepository.appendNotes(appointment);

    return right(note.value);
  }
}
