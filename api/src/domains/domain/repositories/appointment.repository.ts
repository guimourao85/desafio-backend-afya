import { Appointment, AppointmentStatus } from '../model-entities/appointment.entity';

export interface AppointmentFilters {
  doctorId: string;
  /** Instante inicial, inclusivo. */
  from?: Date;
  /** Instante final, inclusivo. */
  to?: Date;
  patientId?: string;
  status?: AppointmentStatus;
  page: number;
  perPage: number;
}

export interface AppointmentPage {
  items: Appointment[];
  total: number;
}

/**
 * A porta de persistência da agenda. `doctorId` em **todo** método, inclusive nos
 * de escrita — a agenda de um médico não é alcançável a partir do token de outro.
 */
export interface AppointmentRepository {
  create(appointment: Appointment): Promise<Appointment>;

  save(appointment: Appointment, doctorId: string): Promise<Appointment>;

  findByIdForDoctor(id: string, doctorId: string): Promise<Appointment | null>;

  /**
   * INV-01, primeira camada: a consulta **viva** do médico exatamente neste
   * instante, se existir.
   *
   * `ignoreId` existe para o reagendamento: sem ele, mover uma consulta para o
   * horário em que ela já está encontraria a si mesma e responderia 409 — a
   * requisição mais inofensiva possível virando conflito.
   */
  findActiveBySlot(
    doctorId: string,
    scheduledAt: Date,
    ignoreId?: string,
  ): Promise<Appointment | null>;

  list(filters: AppointmentFilters): Promise<AppointmentPage>;
}
