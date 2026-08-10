import { DataSource, Not, Repository } from 'typeorm';

import {
  Appointment,
  AppointmentStatus,
} from '@/domains/domain/model-entities/appointment.entity';
import { ConsultationNote } from '@/domains/domain/model-entities/consultation-note.entity';
import {
  AppointmentFilters,
  AppointmentPage,
  AppointmentRepository,
  PatientTimelineFilters,
} from '@/domains/domain/repositories/appointment.repository';

/**
 * O adapter TypeORM da agenda. Toda query filtra `doctor_id`.
 *
 * A atomicidade que INV-01 exige não vem de transação, vem do índice único parcial —
 * duas requisições simultâneas chegam ao `INSERT`, e o banco recusa a segunda. A
 * única escrita que abrange mais de uma linha é `saveWithNotes`, e a transação dela
 * vive aqui, nunca no caso de uso (ADR-04).
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

  /**
   * Grava só as anotações sem identidade — as que `addNote()` acrescentou.
   *
   * **Seguro por construção**, e é esse o ponto: não depende de quem chamou ter
   * carregado a coleção inteira. A alternativa idiomática (`this.repository.save(
   * appointment)` com `cascade`) funcionava **por acidente**, enquanto todo chamador
   * lia a raiz com `relations`; no dia em que um não lesse, o TypeORM entenderia a
   * lista curta como o estado completo e desassociaria as notas ausentes.
   *
   * Escrever na tabela filha aqui não cria um segundo repositório: a **porta** de
   * domínio continua sendo uma só por raiz (`PRODUCT.md §dominios`). Dentro do
   * agregado, o adapter é dono das duas tabelas — é justamente por serem uma unidade
   * de consistência que elas compartilham esta transação.
   */
  appendNotes(appointment: Appointment): Promise<Appointment> {
    const pendentes = (appointment.notes ?? []).filter((note) => !note.id);

    if (pendentes.length === 0) return Promise.resolve(appointment);

    return this.repository.manager.transaction(async (manager) => {
      await manager.save(ConsultationNote, pendentes);

      return appointment;
    });
  }

  findByIdForDoctor(id: string, doctorId: string): Promise<Appointment | null> {
    return this.repository.findOne({ where: { id, doctorId } });
  }

  findByIdWithNotes(id: string, doctorId: string): Promise<Appointment | null> {
    return this.repository.findOne({
      where: { id, doctorId },
      // Sem paginação aqui, então o `ORDER BY` da relação é seguro e fica no banco —
      // diferente da timeline, onde `skip`/`take` sobre o join forçam a ordenação
      // das notas para fora do SQL.
      relations: { notes: true },
      order: { notes: { createdAt: 'ASC' } },
    });
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

  async listByPatientWithNotes({
    doctorId,
    patientId,
    page,
    perPage,
  }: PatientTimelineFilters): Promise<AppointmentPage> {
    const [items, total] = await this.repository
      .createQueryBuilder('appointment')
      // `leftJoin`, não `innerJoin`: consulta sem anotação é linha legítima da
      // história e tem de aparecer, com `notes: []`.
      .leftJoinAndSelect('appointment.notes', 'note')
      .where('appointment.doctorId = :doctorId', { doctorId })
      .andWhere('appointment.patientId = :patientId', { patientId })
      // Histórico se lê do mais recente para trás — o oposto da agenda, que se lê
      // do próximo para o fim. Desempate por `id` pelo mesmo motivo do `list`.
      .orderBy('appointment.scheduledAt', 'DESC')
      .addOrderBy('appointment.id', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage)
      .getManyAndCount();

    // A ordenação das notas fica **aqui**, e não num `addOrderBy('note.createdAt')`,
    // porque `skip`/`take` sobre um join fazem o TypeORM montar uma subquery de ids
    // distintos, e uma coluna da tabela filha dentro dela multiplica as linhas do
    // `DISTINCT` — a página passaria a devolver menos consultas do que `perPage`.
    // Paginar a raiz e ordenar a filha em memória evita o problema em vez de
    // conviver com ele; a lista é a de um atendimento, não do banco inteiro.
    for (const appointment of items) {
      appointment.notes?.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    return { items, total };
  }
}
