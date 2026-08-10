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
 * O paciente — o primeiro dado de **terceiro** que este sistema guarda, e por isso
 * o primeiro que a LGPD alcança.
 *
 * Aponta para o médico **por id**, sem relação navegável. É deliberado: uma relação
 * navegável abriria o caminho de puxar médico e pacientes numa consulta só,
 * atravessando o filtro por consultório que protege a base de todo mundo.
 *
 * A chave estrangeira **existe no banco** mesmo assim, escrita à mão na revisão da
 * migration: garantir que o paciente aponte para um médico real é decisão de
 * persistência, e não depende de existir relação no modelo.
 *
 * Mais detalhes: PRODUCT.md — INV-03, INV-04, ADR-04.
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

  /**
   * O dono. É por esta coluna que **toda** leitura e **toda** escrita do sistema
   * filtra — sem exceção, inclusive nas de escrita. (INV-04)
   */
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

  /**
   * Vazio enquanto o paciente está ativo. Preenchido, é o carimbo de **quando** o
   * direito ao esquecimento foi exercido — dado de conformidade, e a única forma de
   * o sistema saber que este cadastro não aceita mais edição nem consulta nova.
   */
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
   * Exerce o direito ao esquecimento.
   *
   * **O que some:** nome (vira um rótulo genérico), telefone, email e data de
   * nascimento — os quatro campos que apontam para uma pessoa específica.
   *
   * **O que fica:** sexo, altura, peso e **toda a agenda**. Sozinhos, esses três
   * não identificam ninguém, e são o que resta de valor clínico na linha. Apagar os
   * agendamentos destruiria a trilha de atendimento — o oposto do que a lei pede
   * aqui, que é anonimizar a pessoa, não fingir que os atendimentos não ocorreram.
   *
   * **Repetir é inofensivo:** chamar de novo não reescreve a data. *Quando* o
   * direito foi exercido é dado de conformidade, e não muda porque a rede repetiu a
   * requisição.
   *
   * A regra mora aqui, na entidade, e não no caso de uso, porque ela é sobre o
   * próprio estado do paciente. Espalhada por quem chama, a política de "o que se
   * apaga" precisaria ser lembrada em cada lugar novo.
   *
   * Mais detalhes: PRODUCT.md — INV-03.
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
