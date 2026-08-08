import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * O médico — raiz do agregado de autenticação e dono de todo dado do sistema
 * (INV-04). É a entity do ORM por ADR-03: uma classe só, sem espelho anêmico.
 *
 * Nomes de constraint são explícitos de propósito. O gerador inventa `PK_<hash>`
 * quando calado, e nome de constraint é contrato: migration futura, `ON CONFLICT`
 * e diagnóstico de erro do driver dependem dele.
 */
@Entity({ name: 'doctors' })
// `@Unique`, não `@Index({ unique: true })`: o DDL de PLAN.md §6.2 pede
// `CONSTRAINT … UNIQUE`, e é contra ele que a migration é revisada.
@Unique('uk_doctors_email', ['email'])
export class Doctor {
  @PrimaryGeneratedColumn('uuid', { name: 'id', primaryKeyConstraintName: 'pk_doctors' })
  id!: string;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name!: string;

  /** Normalizado na borda (schema Zod), nunca aqui: unicidade só vale sobre texto canônico. */
  @Column({ name: 'email', type: 'varchar', length: 255 })
  email!: string;

  /** Bcrypt, custo de `BCRYPT_ROUNDS`. Nunca sai numa resposta (INV-07). */
  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
