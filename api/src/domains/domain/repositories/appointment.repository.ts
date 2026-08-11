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
 * A nota não tem `doctor_id` próprio, então o escopo por médico só pode ser
 * enforçado no filtro da raiz — por isso `doctorId` aqui é obrigatório.
 */
export interface PatientTimelineFilters {
  doctorId: string;
  patientId: string;
  page: number;
  perPage: number;
}

/** `doctorId` em todo método que recebe um id cru — a exceção é `appendNotes`. */
export interface AppointmentRepository {
  create(appointment: Appointment): Promise<Appointment>;

  save(appointment: Appointment, doctorId: string): Promise<Appointment>;

  /**
   * Grava só as anotações novas da raiz. **Sem `doctorId` de propósito:** o argumento
   * já é uma raiz escopada — só se obtém uma pelos `find*` daqui —, e repetir
   * `appointment.doctorId` num parâmetro seria proteção decorativa.
   */
  appendNotes(appointment: Appointment): Promise<Appointment>;

  /** A raiz **sem** as anotações: reagendar não precisa puxar o prontuário inteiro. */
  findByIdForDoctor(id: string, doctorId: string): Promise<Appointment | null>;

  /** A raiz **com** as anotações. Método separado, e não um booleano: o `JOIN` fica no nome. */
  findByIdWithNotes(id: string, doctorId: string): Promise<Appointment | null>;

  /**
   * A consulta viva neste instante, se existir (INV-01, primeira camada). `ignoreId`
   * evita que um reagendamento para o próprio horário encontre a si mesmo e dê 409.
   */
  findActiveBySlot(
    doctorId: string,
    scheduledAt: Date,
    ignoreId?: string,
  ): Promise<Appointment | null>;

  list(filters: AppointmentFilters): Promise<AppointmentPage>;

  /** Linha do tempo: do mais recente para trás, com as anotações. Uma leitura, nunca N+1. */
  listByPatientWithNotes(filters: PatientTimelineFilters): Promise<AppointmentPage>;
}
