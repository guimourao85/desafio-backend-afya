import { ConsultationNote } from '@/domains/domain/model-entities/consultation-note.entity';

/** O corpo de toda resposta que devolve uma anotação (PLAN.md §9.2). */
export interface ConsultationNoteHttpResponse {
  id: string;
  content: string;
  createdAt: string;
}

/**
 * A via de serialização da anotação.
 *
 * Sem `appointmentId`: a nota só aparece dentro da consulta a que pertence — no
 * detalhe do agendamento ou na linha do tempo —, então repetir o ID do pai em cada
 * item seria ruído. Sem `updatedAt` também: a anotação é imutável na API, e publicar
 * um carimbo que nunca muda prometeria uma edição que não existe.
 */
export class ConsultationNotePresenter {
  static toHttp(note: ConsultationNote): ConsultationNoteHttpResponse {
    return {
      id: note.id,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
    };
  }
}
