import {
  Appointment,
  AppointmentStatus,
} from '@/domains/domain/model-entities/appointment.entity';

import {
  ConsultationNoteHttpResponse,
  ConsultationNotePresenter,
} from './consultation-note.presenter';

/** O corpo de toda resposta que devolve um agendamento. */
export interface AppointmentHttpResponse {
  id: string;
  /** Por ID: agregados se referenciam por identificador, nunca embutidos (ADR-04). */
  patientId: string;
  scheduledAt: string;
  status: AppointmentStatus;
  createdAt: string;
  /** Presente só onde as anotações foram lidas. */
  notes?: ConsultationNoteHttpResponse[];
}

/**
 * **`notes` só aparece quando foi lido.** Na entity, `undefined` é "não carregado" e
 * `[]` é "carregado e vazio" — publicar `[]` na listagem da agenda, que não faz join,
 * afirmaria que a consulta não tem anotação, o que pode ser falso.
 */
export class AppointmentPresenter {
  static toHttp(appointment: Appointment): AppointmentHttpResponse {
    return {
      id: appointment.id,
      patientId: appointment.patientId,
      scheduledAt: appointment.scheduledAt.toISOString(),
      status: appointment.status,
      createdAt: appointment.createdAt.toISOString(),
      ...(appointment.notes && {
        notes: appointment.notes.map(ConsultationNotePresenter.toHttp),
      }),
    };
  }
}
