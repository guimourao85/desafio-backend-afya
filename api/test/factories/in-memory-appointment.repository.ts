import {
  Appointment,
  AppointmentStatus,
} from '@/domains/domain/model-entities/appointment.entity';
import {
  AppointmentFilters,
  AppointmentPage,
  AppointmentRepository,
  PatientTimelineFilters,
} from '@/domains/domain/repositories/appointment.repository';

let sequence = 0;

/**
 * O relógio do duplo: um instante fixo mais N segundos, e não `new Date()`.
 *
 * Duas notas gravadas no mesmo milissegundo teriam ordem indefinida, e o teste que
 * cobre "anotações na ordem em que foram escritas" passaria ou falharia conforme a
 * velocidade da máquina — a espécie de flakiness mais cara de diagnosticar.
 */
let noteSequence = 0;

export function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  sequence += 1;

  return Object.assign(new Appointment(), {
    id: `00000000-0000-4000-9000-${String(sequence).padStart(12, '0')}`,
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    scheduledAt: new Date('2026-08-12T14:00:00.000Z'),
    status: AppointmentStatus.SCHEDULED,
    createdAt: new Date('2026-08-09T12:00:00.000Z'),
    updatedAt: new Date('2026-08-09T12:00:00.000Z'),
    ...overrides,
  });
}

/**
 * O duplo da porta de agenda.
 *
 * `findActiveBySlot` reproduz o critério do **índice parcial**: mesma comparação de
 * instante, e cancelada não ocupa horário. Um duplo que ignorasse o `status` faria
 * os testes de INV-01 provarem o oposto do pretendido — passariam mesmo com a regra
 * quebrada.
 */
export class InMemoryAppointmentRepository implements AppointmentRepository {
  readonly items: Appointment[] = [];

  async create(appointment: Appointment): Promise<Appointment> {
    const persisted = Object.assign(makeAppointment(), appointment, {
      id: `00000000-0000-4000-9000-${String(this.items.length + 900).padStart(12, '0')}`,
    });

    this.items.push(persisted);

    return persisted;
  }

  async save(appointment: Appointment, doctorId: string): Promise<Appointment> {
    const index = this.items.findIndex(
      (item) => item.id === appointment.id && item.doctorId === doctorId,
    );

    if (index >= 0) this.items[index] = appointment;

    return appointment;
  }

  /**
   * Mesmo critério do adapter real: **só a nota sem `id`** é gravada, e é ela que
   * ganha identidade e carimbo — como o `RETURNING` do Postgres faria. Um duplo que
   * devolvesse a nota sem `id` faria o presenter passar no teste e quebrar em
   * produção; um que gravasse a lista inteira esconderia a armadilha real: ler a
   * raiz sem `relations` e persistir com `cascade` desassocia as notas já gravadas,
   * porque o TypeORM trata a coleção carregada como o estado completo.
   */
  async appendNotes(appointment: Appointment): Promise<Appointment> {
    for (const note of appointment.notes ?? []) {
      if (note.id) continue;

      noteSequence += 1;
      note.id = `00000000-0000-4000-8000-${String(noteSequence).padStart(12, '0')}`;
      note.createdAt = new Date(Date.UTC(2026, 7, 10, 12, 0, noteSequence));
      note.updatedAt = note.createdAt;
    }

    const index = this.items.findIndex((item) => item.id === appointment.id);

    if (index >= 0) this.items[index] = appointment;

    return appointment;
  }

  async findByIdForDoctor(id: string, doctorId: string): Promise<Appointment | null> {
    return this.items.find((item) => item.id === id && item.doctorId === doctorId) ?? null;
  }

  async findByIdWithNotes(id: string, doctorId: string): Promise<Appointment | null> {
    const appointment = await this.findByIdForDoctor(id, doctorId);

    // O adapter real devolve `[]` quando não há nota, porque o `leftJoin` sempre
    // materializa a relação. Um duplo que deixasse `undefined` aqui faria o teste do
    // presenter provar o contrário do que produção faz.
    if (appointment && !appointment.notes) appointment.notes = [];

    appointment?.notes?.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return appointment;
  }

  async findActiveBySlot(
    doctorId: string,
    scheduledAt: Date,
    ignoreId?: string,
  ): Promise<Appointment | null> {
    return (
      this.items.find(
        (item) =>
          item.doctorId === doctorId &&
          item.scheduledAt.getTime() === scheduledAt.getTime() &&
          item.status !== AppointmentStatus.CANCELLED &&
          item.id !== ignoreId,
      ) ?? null
    );
  }

  async list({
    doctorId,
    from,
    to,
    patientId,
    status,
    page,
    perPage,
  }: AppointmentFilters): Promise<AppointmentPage> {
    const scoped = this.items
      .filter((item) => item.doctorId === doctorId)
      .filter((item) => !from || item.scheduledAt >= from)
      .filter((item) => !to || item.scheduledAt <= to)
      .filter((item) => !patientId || item.patientId === patientId)
      .filter((item) => !status || item.status === status)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

    return {
      items: scoped.slice((page - 1) * perPage, page * perPage),
      total: scoped.length,
    };
  }

  async listByPatientWithNotes({
    doctorId,
    patientId,
    page,
    perPage,
  }: PatientTimelineFilters): Promise<AppointmentPage> {
    const scoped = this.items
      // `doctorId` **e** `patientId`: o duplo tem de reproduzir INV-04, senão o
      // teste de isolamento entre consultórios passaria com a regra quebrada.
      .filter((item) => item.doctorId === doctorId && item.patientId === patientId)
      // Histórico do mais recente para trás — o inverso de `list`.
      .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());

    for (const appointment of scoped) {
      appointment.notes?.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    return {
      items: scoped.slice((page - 1) * perPage, page * perPage),
      total: scoped.length,
    };
  }
}
