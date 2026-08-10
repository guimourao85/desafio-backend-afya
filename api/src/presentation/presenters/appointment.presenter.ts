import {
  Appointment,
  AppointmentStatus,
} from '@/domains/domain/model-entities/appointment.entity';

import {
  ConsultationNoteHttpResponse,
  ConsultationNotePresenter,
} from './consultation-note.presenter';

/** O corpo de toda resposta que devolve um agendamento (PLAN.md §9.2). */
export interface AppointmentHttpResponse {
  id: string;
  /** **Por ID** (ADR-04) — o paciente não vem embutido. */
  patientId: string;
  scheduledAt: string;
  status: AppointmentStatus;
  createdAt: string;
  /** Presente só onde as anotações foram lidas — ver a nota da classe. */
  notes?: ConsultationNoteHttpResponse[];
}

/**
 * A via de serialização do agendamento.
 *
 * Devolve `patientId`, e não `patient: { id, name }`. Embutir o paciente seria
 * conveniente para a tela e criaria exatamente o join entre agregados que ADR-04
 * existe para impedir — e, uma vez publicado no contrato, seria caro de tirar.
 * Quem precisa do nome tem `GET /api/patients/:id`.
 *
 * `doctorId` fica de fora: o cliente já sabe de quem é a agenda, porque só enxerga
 * a sua.
 *
 * **`notes` aparece só quando foi lido.** `undefined` na entity significa "não
 * carregado"; `[]` significa "carregado e vazio". Publicar `notes: []` no primeiro
 * caso — que é o da listagem da agenda, onde não há join — diria ao cliente que a
 * consulta não tem anotação nenhuma, o que pode ser falso. Omitir o campo é a única
 * resposta honesta para "não perguntamos". Quem quer as anotações tem
 * `GET /api/appointments/:id` e a linha do tempo, e nessas duas o campo é garantido.
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
