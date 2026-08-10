import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Caminho **relativo**, não `@/`, pela mesma razão de `appointment.entity.ts`: o
// `typeorm-ts-node-commonjs` do `migration:generate` carrega a entity fora do
// runtime do Nest e não resolve o alias.
import { Appointment } from './appointment.entity';

/**
 * A observação que o médico escreve sobre um atendimento — **entidade interna** do
 * agregado `Appointment`, nunca uma raiz.
 *
 * É a única relação navegável do modelo, e ela é legítima porque acontece **dentro**
 * do agregado: ADR-04 proíbe o join entre agregados, não dentro de um. É esse
 * `@ManyToOne` que faz o gerador emitir a FK com o nome certo — para as FKs entre
 * agregados (`patient_id`, `doctor_id`) não há relação para derivar, e elas entram à
 * mão na revisão da migration (`PLAN.md §6.3`).
 *
 * **Não há `ConsultationNoteRepository`** (`PRODUCT.md §dominios`): a nota chega ao
 * banco pendurada na raiz, e a raiz só é alcançável escopada por `doctorId`. É daí
 * que ela herda INV-04 — sem coluna `doctor_id` própria, que poderia divergir da
 * raiz e apontar para outro médico.
 */
@Entity({ name: 'consultation_notes' })
// Motivo: performance. Serve à linha do tempo (RF-06), que lê as anotações de uma
// consulta na ordem em que foram escritas. `idx_<tabela>_<colunas>` conforme
// `review-database.md §regras` — o DDL de `PLAN.md §6.2` abreviava a tabela.
@Index('idx_consultation_notes_appointment', ['appointmentId', 'createdAt'])
// Última linha para o que não passa pelo controller (seed, migration, correção
// manual). O `.min(1)` do Zod cobre a borda HTTP; este cobre o resto. Mesmo papel
// de `ck_patients_birth_date`.
@Check('ck_consultation_notes_content_not_empty', `length(btrim(content)) > 0`)
export class ConsultationNote {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    primaryKeyConstraintName: 'pk_consultation_notes',
  })
  id!: string;

  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  /**
   * Sem `onDelete`, ou seja `NO ACTION`: apagar fisicamente uma consulta que tem
   * anotação **deve** falhar. `CASCADE` daria a um `DELETE` manual o poder de sumir
   * com registro clínico, e a API nem tem `DELETE` físico — cancelar é
   * `status = CANCELLED`.
   */
  @ManyToOne(() => Appointment, (appointment) => appointment.notes)
  @JoinColumn({
    name: 'appointment_id',
    foreignKeyConstraintName: 'fk_consultation_notes_appointments',
  })
  appointment?: Appointment;

  /** `text`, não `varchar(N)`: anotação clínica não tem limite natural. */
  @Column({ name: 'content', type: 'text' })
  content!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /**
   * A anotação é imutável na API (sem `PATCH`, sem `DELETE`), então esta coluna
   * nunca muda de valor. Ela fica pelo padrão de audit column das outras quatro
   * tabelas — divergir custaria uma exceção de padrão para economizar 8 bytes.
   */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
