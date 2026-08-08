import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * O refresh token persistido. Agregado próprio: `Doctor` é referenciado **por ID**,
 * sem `@ManyToOne` (ADR-04) — relação navegável entre agregados abre o join que a
 * fronteira existe para impedir.
 *
 * A FK `fk_refresh_tokens_doctors` existe no banco mesmo assim, escrita à mão na
 * revisão da migration: integridade referencial é decisão de persistência, e não
 * precisa de relação no modelo para valer.
 */
@Entity({ name: 'refresh_tokens' })
@Unique('uk_refresh_tokens_hash', ['tokenHash'])
// Serve à busca por médico em 02.02 (`revokeByDoctor`), que sem índice varreria a tabela.
@Index('idx_refresh_tokens_doctor', ['doctorId'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid', { name: 'id', primaryKeyConstraintName: 'pk_refresh_tokens' })
  id!: string;

  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  /**
   * SHA-256 hex do token — 64 caracteres, sempre (INV-06). `char(64)` e não
   * `varchar`: o comprimento é fixo por definição do algoritmo, e o tipo que o diz
   * é o que denuncia no banco qualquer coisa gravada em claro.
   */
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  /** Nulo enquanto vale. É o único campo nulo da tabela. */
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
