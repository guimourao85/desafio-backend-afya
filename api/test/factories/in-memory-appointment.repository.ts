import {
  Appointment,
  AppointmentStatus,
} from '@/domains/domain/model-entities/appointment.entity';
import {
  AppointmentFilters,
  AppointmentPage,
  AppointmentRepository,
} from '@/domains/domain/repositories/appointment.repository';

let sequence = 0;

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

  async findByIdForDoctor(id: string, doctorId: string): Promise<Appointment | null> {
    return this.items.find((item) => item.id === id && item.doctorId === doctorId) ?? null;
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
}
