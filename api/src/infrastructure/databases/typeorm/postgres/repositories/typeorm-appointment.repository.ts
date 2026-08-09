import { DataSource, Not, Repository } from 'typeorm';

import {
  Appointment,
  AppointmentStatus,
} from '@/domains/domain/model-entities/appointment.entity';
import {
  AppointmentFilters,
  AppointmentPage,
  AppointmentRepository,
} from '@/domains/domain/repositories/appointment.repository';

/**
 * O adapter TypeORM da agenda. Toda query filtra `doctor_id`.
 *
 * Nenhuma transação: cada operação toca uma linha de um agregado. A atomicidade que
 * INV-01 exige não vem de transação, vem do índice único parcial — duas requisições
 * simultâneas chegam ao `INSERT`, e o banco recusa a segunda.
 */
export class TypeOrmAppointmentRepository implements AppointmentRepository {
  private readonly repository: Repository<Appointment>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(Appointment);
  }

  create(appointment: Appointment): Promise<Appointment> {
    return this.repository.save(appointment);
  }

  async save(appointment: Appointment, doctorId: string): Promise<Appointment> {
    await this.repository.update(
      { id: appointment.id, doctorId },
      { scheduledAt: appointment.scheduledAt, status: appointment.status },
    );

    return appointment;
  }

  findByIdForDoctor(id: string, doctorId: string): Promise<Appointment | null> {
    return this.repository.findOne({ where: { id, doctorId } });
  }

  findActiveBySlot(
    doctorId: string,
    scheduledAt: Date,
    ignoreId?: string,
  ): Promise<Appointment | null> {
    return this.repository.findOne({
      where: {
        doctorId,
        scheduledAt,
        // O mesmo critério do `WHERE` do índice parcial: cancelada não ocupa
        // horário. Se os dois divergirem, a aplicação recusa o que o banco aceita —
        // ou pior, o contrário.
        status: Not(AppointmentStatus.CANCELLED),
        ...(ignoreId ? { id: Not(ignoreId) } : {}),
      },
    });
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
    const query = this.repository
      .createQueryBuilder('appointment')
      .where('appointment.doctorId = :doctorId', { doctorId });

    if (from) query.andWhere('appointment.scheduledAt >= :from', { from });
    if (to) query.andWhere('appointment.scheduledAt <= :to', { to });
    if (patientId) query.andWhere('appointment.patientId = :patientId', { patientId });
    if (status) query.andWhere('appointment.status = :status', { status });

    // Agenda se lê do próximo para o fim. Desempate por `id` porque o Postgres não
    // promete ordem entre iguais, e sem ele a página 2 pode repetir uma linha da 1.
    const [items, total] = await query
      .orderBy('appointment.scheduledAt', 'ASC')
      .addOrderBy('appointment.id', 'ASC')
      .skip((page - 1) * perPage)
      .take(perPage)
      .getManyAndCount();

    return { items, total };
  }
}
