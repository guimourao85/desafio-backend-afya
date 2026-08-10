import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { AppointmentStatus } from '@/domains/domain/model-entities/appointment.entity';

const MAX_PER_PAGE = 100;

/**
 * Defesa de borda contra payload abusivo, **não** regra de domínio — por isso vive
 * aqui e não na entity, e por isso o banco guarda `text` sem limite: anotação
 * clínica não tem tamanho natural, mas um `POST` autenticado também não precisa
 * aceitar um megabyte de texto.
 */
const MAX_NOTE_LENGTH = 5000;

const UNKNOWN_FIELD_MESSAGE = 'Campo desconhecido no corpo da requisição.';

/**
 * Instante ISO-8601 → `Date`. `z.coerce.date()` aceitaria `"amanhã"` e qualquer
 * coisa que o construtor de `Date` engula; aqui o formato é cobrado antes.
 */
const isoInstant = (message: string) =>
  z
    .string({ required_error: message })
    .datetime({ message: 'Informe um instante ISO-8601 (ex.: 2026-08-12T14:00:00.000Z).' })
    .transform((value) => new Date(value));

/**
 * `POST /api/appointments`.
 *
 * **Sem validação de data futura**: registrar atendimento retroativo é caso real de
 * prontuário, e o desafio não pede consulta futura. Recusar inventaria regra.
 */
export const scheduleAppointmentSchema = z
  .object({
    patientId: z
      .string({ required_error: 'O paciente é obrigatório.' })
      .uuid('Informe um identificador de paciente válido.'),
    scheduledAt: isoInstant('A data e hora da consulta são obrigatórias.'),
  })
  .strict(UNKNOWN_FIELD_MESSAGE);

export class ScheduleAppointmentDto extends createZodDto(scheduleAppointmentSchema) {}

/**
 * `PATCH /api/appointments/:id` — reagendar e/ou concluir.
 *
 * `patientId` **não existe aqui**: trocar o paciente de uma consulta reescreveria o
 * histórico de atendimento de duas pessoas. `PLAN.md §9.2` é explícito — cancele e
 * agende de novo. Com `.strict()`, mandar o campo é 400.
 *
 * `status` só aceita `COMPLETED`: cancelar é `DELETE`, e consulta concluída não
 * volta a ser agendada.
 */
export const updateAppointmentSchema = z
  .object({
    scheduledAt: isoInstant('Informe a nova data e hora.').optional(),
    status: z
      .literal(AppointmentStatus.COMPLETED, {
        errorMap: () => ({
          message: 'O único status aceito é COMPLETED. Para cancelar, use DELETE.',
        }),
      })
      .optional(),
  })
  .strict(UNKNOWN_FIELD_MESSAGE)
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

export class UpdateAppointmentDto extends createZodDto(updateAppointmentSchema) {}

export const listAppointmentsQuerySchema = z
  .object({
    from: isoInstant('').optional(),
    to: isoInstant('').optional(),
    patientId: z.string().uuid('Informe um identificador de paciente válido.').optional(),
    status: z
      .nativeEnum(AppointmentStatus, {
        errorMap: () => ({ message: 'Status deve ser SCHEDULED, COMPLETED ou CANCELLED.' }),
      })
      .optional(),
    page: z.coerce.number().int().positive('A página deve ser maior que zero.').default(1),
    perPage: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_PER_PAGE, `O máximo por página é ${MAX_PER_PAGE}.`)
      .default(20),
  })
  .strict('Parâmetro de busca desconhecido.')
  // Intervalo invertido é payload malformado, não busca vazia: devolver 200 com
  // lista vazia esconderia o erro de quem montou a query.
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'O início do período não pode ser depois do fim.',
    path: ['from'],
  });

export class ListAppointmentsQueryDto extends createZodDto(listAppointmentsQuerySchema) {}

/**
 * `POST /api/appointments/:id/notes`.
 *
 * `.trim()` **antes** do `.min(1)`: os checks do Zod rodam na ordem em que foram
 * encadeados, então uma anotação de só espaços é aparada até virar vazia e recusada
 * com 400. Sem essa ordem, `"   "` passaria pela borda e só o `CHECK` do banco a
 * pararia — com 500 no lugar de 400, e sem dizer qual campo estava errado.
 */
export const addConsultationNoteSchema = z
  .object({
    content: z
      .string({ required_error: 'A anotação é obrigatória.' })
      .trim()
      .min(1, 'A anotação é obrigatória.')
      .max(MAX_NOTE_LENGTH, `A anotação deve ter no máximo ${MAX_NOTE_LENGTH} caracteres.`),
  })
  .strict(UNKNOWN_FIELD_MESSAGE);

export class AddConsultationNoteDto extends createZodDto(addConsultationNoteSchema) {}

/**
 * `GET /api/patients/:id/appointments`.
 *
 * Paginada como toda listagem da API (`PLAN.md §9.3`), e não um array cru: a
 * história de um paciente crônico não tem tamanho previsível, e um contrato
 * diferente por rota é o defeito que o envelope único existe para evitar.
 */
export const patientTimelineQuerySchema = z
  .object({
    page: z.coerce.number().int().positive('A página deve ser maior que zero.').default(1),
    perPage: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_PER_PAGE, `O máximo por página é ${MAX_PER_PAGE}.`)
      .default(20),
  })
  .strict('Parâmetro de busca desconhecido.');

export class PatientTimelineQueryDto extends createZodDto(patientTimelineQuerySchema) {}
