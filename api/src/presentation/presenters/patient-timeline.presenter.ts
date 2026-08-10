import {
  Appointment,
  AppointmentStatus,
} from '@/domains/domain/model-entities/appointment.entity';

import {
  ConsultationNoteHttpResponse,
  ConsultationNotePresenter,
} from './consultation-note.presenter';

/** Um item da linha do tempo do paciente (PLAN.md §9.2). */
export interface PatientTimelineItemHttpResponse {
  id: string;
  scheduledAt: string;
  status: AppointmentStatus;
  notes: ConsultationNoteHttpResponse[];
}

/**
 * A consulta como a história do paciente a mostra: quando foi, em que estado ficou e
 * o que o médico escreveu.
 *
 * Sem `patientId`: ele está na URL, e repeti-lo em cada item de uma lista que já é
 * *daquele* paciente é ruído. Sem `createdAt` da consulta: na linha do tempo o que
 * importa é quando o atendimento **foi**, não quando o registro nasceu.
 *
 * `notes` sempre presente e sempre array — nunca `null`, nunca ausente. A rota lê com
 * `leftJoin`, então consulta sem anotação é `[]`; o `?? []` é a rede para o dia em
 * que alguém chamar este presenter com uma raiz lida sem `relations`, caso em que
 * omitir o campo seria pior: o cliente leria "sem anotações" onde a verdade é "não
 * perguntamos".
 *
 * **Consultas canceladas entram**, com o `status` no payload: o histórico é
 * registro contábil, e esconder a cancelada seria reescrevê-lo.
 */
export class PatientTimelinePresenter {
  static toHttp(appointment: Appointment): PatientTimelineItemHttpResponse {
    return {
      id: appointment.id,
      scheduledAt: appointment.scheduledAt.toISOString(),
      status: appointment.status,
      notes: (appointment.notes ?? []).map(ConsultationNotePresenter.toHttp),
    };
  }
}
