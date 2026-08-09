import {
  Appointment,
  AppointmentStatus,
} from '@/domains/domain/model-entities/appointment.entity';

/** O corpo de toda resposta que devolve um agendamento (PLAN.md §9.2). */
export interface AppointmentHttpResponse {
  id: string;
  /** **Por ID** (ADR-04) — o paciente não vem embutido. */
  patientId: string;
  scheduledAt: string;
  status: AppointmentStatus;
  createdAt: string;
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
 */
export class AppointmentPresenter {
  static toHttp(appointment: Appointment): AppointmentHttpResponse {
    return {
      id: appointment.id,
      patientId: appointment.patientId,
      scheduledAt: appointment.scheduledAt.toISOString(),
      status: appointment.status,
      createdAt: appointment.createdAt.toISOString(),
    };
  }
}
