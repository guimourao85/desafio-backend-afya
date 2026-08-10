import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Caminho **relativo**, não `@/`: o `typeorm-ts-node-commonjs` do
// `migration:generate` carrega a entity fora do runtime do Nest e não resolve o
// alias — `Cannot find module '@/shared/errors/either'` mata a geração. As outras
// entities nunca esbarraram nisso porque só importam vizinhos de pasta.
import { Either, left, right } from '../../../shared/errors/either';
import { BusinessRuleViolationError } from '../../../shared/errors/types';
import { ConsultationNote } from './consultation-note.entity';

export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** As recusas da máquina de estados — o texto exato que o cliente recebe no 422. */
const CANNOT_RESCHEDULE_MESSAGE = 'Consulta cancelada ou concluída não pode ser reagendada.';
const CANNOT_COMPLETE_MESSAGE = 'Só uma consulta agendada pode ser concluída.';
const CANNOT_CANCEL_COMPLETED_MESSAGE = 'Consulta já concluída não pode ser cancelada.';

/** Consulta cancelada não aceita anotação (INV-05); o porquê vive em `addNote()`. */
const CANNOT_ANNOTATE_CANCELLED_MESSAGE = 'Consulta cancelada não aceita anotações.';

/**
 * O compromisso da agenda — raiz do agregado, e a entidade que carrega a regra
 * central do sistema.
 *
 * Referencia médico e paciente **por ID**, sem `@ManyToOne` (ADR-04). As duas FKs
 * existem no banco, escritas à mão na revisão da migration.
 *
 * `ConsultationNote[]` é a exceção — e é exceção porque é **dentro** do agregado.
 * ADR-04 proíbe navegar entre agregados; a nota não é um.
 */
@Entity({ name: 'appointments' })
// INV-01 no banco, e a única forma de fechar a corrida entre duas requisições
// simultâneas. O `where` é o que permite reagendar para um horário que um
// cancelamento liberou — sem ele o slot ficaria queimado para sempre.
@Index('uk_appointments_doctor_slot', ['doctorId', 'scheduledAt'], {
  unique: true,
  where: `status <> 'CANCELLED'`,
})
// Motivo: performance. Serve ao filtro `?patientId=` da listagem e à linha do tempo
// do paciente — as duas leem por paciente. Sem `DESC` porque `IndexOptions`
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

  /**
   * As anotações do atendimento.
   *
   * **Sem `cascade`, deliberadamente.** Salvar a raiz e
   * deixar o TypeORM propagar seria o caminho idiomático e é uma armadilha: ao
   * persistir uma raiz cuja coleção está carregada, ele trata a lista como o estado
   * completo e desassocia o que não estiver nela. Numa raiz lida sem `relations`,
   * isso apagaria a referência das anotações já gravadas. Quem escreve nota é
   * `AppointmentRepository.appendNotes`, que grava só as novas.
   *
   * Opcional de propósito: `undefined` significa "não carregada", e `[]` significa
   * "carregada e vazia". O presenter usa exatamente essa diferença para não
   * publicar `notes: []` numa listagem que não as leu.
   */
  @OneToMany(() => ConsultationNote, (note) => note.appointment)
  notes?: ConsultationNote[];

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

  /**
   * **A única fábrica de `ConsultationNote`** (INV-05). Nenhum service ou controller
   * instancia a entidade interna direto: se pudesse, a checagem de estado abaixo
   * viraria opcional, e uma nota poderia nascer sem consulta ou numa cancelada.
   *
   * `isActive()` — e não `isTerminal()` — porque **concluída aceita anotação**:
   * anota-se depois de atender, que é o caso normal. Só a cancelada recusa, porque
   * o atendimento que ela descreveria não aconteceu.
   */
  addNote(content: string): Either<BusinessRuleViolationError, ConsultationNote> {
    if (!this.isActive()) {
      return left(new BusinessRuleViolationError(CANNOT_ANNOTATE_CANCELLED_MESSAGE));
    }

    const note = Object.assign(new ConsultationNote(), {
      appointmentId: this.id,
      content,
    });

    // `?? []` porque a raiz pode ter sido lida sem `relations`. A lista pode ficar
    // parcial, e isso é seguro **por causa do adapter**: `appendNotes` grava apenas
    // as notas sem identidade. Não confie no `cascade` do TypeORM aqui — ele leria a
    // lista parcial como o estado completo.
    this.notes = [...(this.notes ?? []), note];

    return right(note);
  }
}
