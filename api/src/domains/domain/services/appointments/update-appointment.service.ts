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
import { APPOINTMENT_NOT_FOUND_MESSAGE } from './get-appointment.service';
import { SCHEDULE_CONFLICT_MESSAGE } from './schedule-appointment.service';

export interface UpdateAppointmentRequest {
  doctorId: string;
  appointmentId: string;
  scheduledAt?: Date;
  /**
   * Só aceita `COMPLETED`. Cancelar tem rota própria (`DELETE`), e consulta já
   * concluída não volta atrás — o tipo é o que impede o cliente de tentar.
   */
  status?: AppointmentStatus.COMPLETED;
}

export type UpdateAppointmentResult = Either<
  ResourceNotFoundError | BusinessRuleViolationError | ScheduleConflictError,
  Appointment
>;

/**
 * O texto do 422 de paciente anonimizado ao reagendar. Copiado de
 * `PRODUCT.md §regras`, nunca inventado aqui.
 */
const ANONYMIZED_PATIENT_RESCHEDULE_MESSAGE =
  'Paciente anonimizado (LGPD) não pode ter consultas reagendadas.';

/**
 * Reagenda e/ou conclui uma consulta — as duas operações no mesmo caso de uso.
 *
 * **Um service só, para um `PATCH` só.** Com dois (um para reagendar, outro para
 * concluir), o controller teria de escolher qual chamar olhando o corpo da
 * requisição — regra de negócio vazando para a camada de transporte — ou os dois
 * escreveriam na mesma consulta em sequência.
 *
 * A divisão de trabalho aqui vale a leitura: este método decide a **ordem** das
 * coisas e conversa com o banco; **quais** mudanças de estado são permitidas é
 * conhecimento da própria consulta. Ele não sabe que "cancelada não reagenda" — ele
 * pergunta à consulta e obedece à resposta.
 *
 * Reagendar tem uma condição a mais que concluir: o paciente precisa continuar
 * ativo. Quem teve os dados pessoais excluídos não recebe marcação nova de horário —
 * mas a consulta que já aconteceu **pode** ser concluída, porque registrar o que
 * ocorreu é preservar o histórico, não criar compromisso novo.
 *
 * Atende RF-04. Mais detalhes: PLAN.md §9.2 · PRODUCT.md — INV-01, INV-02, INV-04.
 */
@Injectable()
export class UpdateAppointmentService {
  constructor(
    @Inject(APPOINTMENTS_REPOSITORY)
    private readonly appointmentRepository: AppointmentRepository,
    // O service público do `PatientsModule`, não o repositório dele: a pergunta
    // "esse paciente ainda aceita operação?" atravessa a fronteira pela porta da
    // frente. Mesmo caminho de `ScheduleAppointmentService`.
    private readonly findPatientSummary: FindPatientSummaryService,
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

    // Reagendar e concluir são independentes: dá para mandar só um dos dois, ou os
    // dois na mesma requisição. A gravação acontece uma vez só, no fim.
    if (scheduledAt) {
      // INV-02, e a ordem importa: o estado do **paciente** é perguntado antes do
      // conflito de horário. Se o paciente não aceita mais operação, o horário estar
      // livre ou ocupado é irrelevante — e responder 409 num caso desses mandaria o
      // cliente procurar outro horário para um pedido que nenhum horário resolve.
      const patient = await this.findPatientSummary.execute({
        doctorId,
        patientId: appointment.patientId,
      });

      // Propaga o 404 do outro módulo em vez de inventar um. Na prática só acontece
      // se o paciente sumir entre a leitura da consulta e esta linha.
      if (patient.isLeft()) {
        return left(patient.value);
      }

      if (patient.value.isAnonymized) {
        return left(new BusinessRuleViolationError(ANONYMIZED_PATIENT_RESCHEDULE_MESSAGE));
      }

      // Checa o conflito **antes** de mexer no estado: uma requisição que vai ser
      // recusada não pode deixar rastro. O `appointment.id` entra na busca para a
      // consulta não conflitar consigo mesma ao ser "movida" para o horário em que
      // já está — o pedido mais inofensivo possível virando um 409.
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
