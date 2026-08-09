import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Caminho **relativo**, não `@/`: o `typeorm-ts-node-commonjs` do
// `migration:generate` carrega a entity fora do runtime do Nest e não resolve o
// alias — `Cannot find module '@/shared/errors/either'` mata a geração. As outras
// entities nunca esbarraram nisso porque só importam vizinhos de pasta.
import { Either, left, right } from '../../../shared/errors/either';
import { BusinessRuleViolationError } from '../../../shared/errors/types';

export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** Os três textos das recusas de estado, fixados antes de codar (sprint 04.01, decisão 24). */
const CANNOT_RESCHEDULE_MESSAGE = 'Consulta cancelada ou concluída não pode ser reagendada.';
const CANNOT_COMPLETE_MESSAGE = 'Só uma consulta agendada pode ser concluída.';
const CANNOT_CANCEL_COMPLETED_MESSAGE = 'Consulta já concluída não pode ser cancelada.';

/**
 * O compromisso da agenda — raiz do agregado, e a entidade que carrega a regra
 * central do sistema.
 *
 * Referencia médico e paciente **por ID**, sem `@ManyToOne` (ADR-04). As duas FKs
 * existem no banco, escritas à mão na revisão da migration.
 *
 * `ConsultationNote[]` **não** está aqui: a anotação nasce em F5, e com ela o
 * `@OneToMany` — relação permitida por ser **dentro** do agregado.
 */
@Entity({ name: 'appointments' })
// INV-01 no banco, e a única forma de fechar a corrida entre duas requisições
// simultâneas. O `where` é o que permite reagendar para um horário que um
// cancelamento liberou — sem ele o slot ficaria queimado para sempre.
@Index('uk_appointments_doctor_slot', ['doctorId', 'scheduledAt'], {
  unique: true,
  where: `status <> 'CANCELLED'`,
})
// Motivo: performance. Serve ao filtro por paciente desta sprint e à linha do tempo
// de F5 — as duas leem do mais recente para trás. Sem `DESC` porque `IndexOptions`
// não expressa direção por coluna, e o Postgres varre btree para trás com o mesmo
// custo.
@Index('idx_appointments_patient', ['patientId', 'scheduledAt'])
@Check('ck_appointments_status', `status IN ('SCHEDULED','COMPLETED','CANCELLED')`)
export class Appointment {
  @PrimaryGeneratedColumn('uuid', { name: 'id', primaryKeyConstraintName: 'pk_appointments' })
  id!: string;

  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  /** `timestamptz`: a agenda é sobre instantes, e instante sem fuso é ambíguo. */
  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: AppointmentStatus.SCHEDULED,
  })
  status!: AppointmentStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /** Viva para o índice parcial: é `status <> 'CANCELLED'` em forma de método. */
  isActive(): boolean {
    return this.status !== AppointmentStatus.CANCELLED;
  }

  /** `SCHEDULED` é o único estado mutável; os outros dois são terminais. */
  isTerminal(): boolean {
    return this.status !== AppointmentStatus.SCHEDULED;
  }

  /**
   * A máquina de estados mora aqui, e não nos casos de uso, pela mesma razão de
   * `Patient.anonymize()`: é regra sobre o próprio estado. Espalhada por três
   * services, ela precisaria ser lembrada três vezes.
   */
  rescheduleTo(instant: Date): Either<BusinessRuleViolationError, void> {
    if (this.isTerminal()) {
      return left(new BusinessRuleViolationError(CANNOT_RESCHEDULE_MESSAGE));
    }

    this.scheduledAt = instant;

    return right(undefined);
  }

  complete(): Either<BusinessRuleViolationError, void> {
    // Concluir já concluída também é recusado: terminal não reprocessa, e a
    // segunda conclusão não teria significado clínico nenhum.
    if (this.isTerminal()) {
      return left(new BusinessRuleViolationError(CANNOT_COMPLETE_MESSAGE));
    }

    this.status = AppointmentStatus.COMPLETED;

    return right(undefined);
  }

  /**
   * Cancelar é o único guarda assimétrico:
   *
   * - **já cancelada** → `Right` sem tocar em nada. Repetição de rede não é erro,
   *   e a segunda chamada não destrói informação (204 nas duas).
   * - **concluída** → `Left`. Cancelar o que já foi atendido apagaria o registro
   *   de que o atendimento aconteceu — e é justamente o histórico que a agenda
   *   existe para preservar.
   */
  cancel(): Either<BusinessRuleViolationError, void> {
    if (this.status === AppointmentStatus.COMPLETED) {
      return left(new BusinessRuleViolationError(CANNOT_CANCEL_COMPLETED_MESSAGE));
    }

    this.status = AppointmentStatus.CANCELLED;

    return right(undefined);
  }
}
