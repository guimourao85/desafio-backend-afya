import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { numericTransformer } from './numeric.transformer';

/** Conjunto fechado, gravado como `varchar` + `CHECK` — não `enum` nativo do Postgres. */
export enum PatientSex {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  UNDISCLOSED = 'UNDISCLOSED',
}

/**
 * O que substitui o nome quando o paciente exerce o direito ao esquecimento.
 * `name` é `NOT NULL` no schema: não há como anulá-lo, e o rótulo mantém a linha
 * legível numa listagem sem dizer quem era.
 */
export const ANONYMIZED_PATIENT_NAME = 'Paciente anonimizado';

/**
 * O paciente — raiz do próprio agregado, e o primeiro dado de terceiro que este
 * sistema guarda.
 *
 * Referencia o médico **por ID**, sem `@ManyToOne` (ADR-04): a FK existe no banco,
 * escrita à mão na revisão da migration, porque integridade referencial é decisão de
 * persistência e não precisa de relação navegável para valer.
 */
@Entity({ name: 'patients' })
// Motivo: performance. **Toda** consulta desta sprint filtra por médico (INV-04) —
// sem ele, cada listagem varre a tabela inteira de todos os consultórios.
@Index('idx_patients_doctor', ['doctorId'])
@Check('ck_patients_sex', `sex IS NULL OR sex IN ('MALE','FEMALE','OTHER','UNDISCLOSED')`)
@Check('ck_patients_height', 'height_m IS NULL OR (height_m > 0.30 AND height_m < 2.60)')
@Check('ck_patients_weight', 'weight_kg IS NULL OR (weight_kg > 0.50 AND weight_kg < 500)')
// Última linha de defesa: o Zod barra antes, mas nascimento no futuro é o tipo de
// dado que entra por script, seed ou correção manual — caminhos que não passam pela
// borda HTTP.
@Check('ck_patients_birth_date', 'birth_date IS NULL OR birth_date <= CURRENT_DATE')
export class Patient {
  @PrimaryGeneratedColumn('uuid', { name: 'id', primaryKeyConstraintName: 'pk_patients' })
  id!: string;

  /** O dono. É por esta coluna que INV-04 filtra — em **todo** método da porta. */
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  /** Opcional e **sem** `UNIQUE`: dois pacientes podem dividir o email de um familiar. */
  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  /**
   * `date` puro — nascimento não tem hora nem fuso. Tipado como `string` porque é
   * assim que o driver o devolve (`'1987-01-01'`), e é assim que o contrato o
   * publica. Tipar como `Date` faria o compilador afirmar algo falso.
   */
  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate!: string | null;

  @Column({ name: 'sex', type: 'varchar', length: 20, nullable: true })
  sex!: PatientSex | null;

  @Column({
    name: 'height_m',
    type: 'numeric',
    precision: 3,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  heightM!: number | null;

  @Column({
    name: 'weight_kg',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  weightKg!: number | null;

  /** Nulo enquanto o paciente está ativo. É o carimbo de quando a LGPD foi exercida. */
  @Column({ name: 'anonymized_at', type: 'timestamptz', nullable: true })
  anonymizedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  isAnonymized(): boolean {
    return this.anonymizedAt !== null;
  }

  /**
   * Exerce o direito ao esquecimento (INV-03).
   *
   * A regra é sobre o **próprio estado**, então mora aqui: no caso de uso, a entity
   * viraria um saco de setters e a política de "o que se apaga" se espalharia por
   * quem chamasse.
   *
   * Idempotente por decisão: chamar de novo não reescreve `anonymizedAt`, porque
   * **quando** o direito foi exercido é o dado de conformidade — e ele não muda
   * porque alguém repetiu a requisição.
   *
   * O que **não** se apaga: `sex`, `heightM`, `weightKg` e todo o histórico de
   * agenda. Sozinhos não identificam ninguém, e são o que resta de valor clínico
   * na linha. Apagar agendamento seria destruir trilha de atendimento — o oposto
   * do que a lei pede aqui.
   */
  anonymize(at: Date): void {
    if (this.isAnonymized()) return;

    this.name = ANONYMIZED_PATIENT_NAME;
    this.phone = null;
    this.email = null;
    this.birthDate = null;
    this.anonymizedAt = at;
  }
}
