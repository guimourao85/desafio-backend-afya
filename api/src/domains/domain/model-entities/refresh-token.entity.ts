import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * A sessão guardada no banco — o que permite renovar o login sem pedir a senha de
 * novo, e o que o logout revoga.
 *
 * Aponta para o médico **por id**, sem relação navegável. É deliberado: uma relação
 * navegável abriria o caminho de, a partir de uma sessão, puxar o médico e daí a
 * base inteira dele numa consulta só — exatamente o atalho que a separação entre
 * áreas existe para impedir.
 *
 * A chave estrangeira **existe no banco** mesmo assim, escrita à mão na revisão da
 * migration: garantir que a sessão aponte para um médico real é decisão de
 * persistência, e não depende de existir relação no modelo.
 *
 * Mais detalhes: PRODUCT.md — ADR-04.
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
   * A versão embaralhada do token — 64 caracteres, sempre, porque é o tamanho fixo
   * que o algoritmo produz.
   *
   * O tipo declara esse comprimento fixo em vez de aceitar "texto de até N": é o
   * que faz o **banco denunciar** qualquer tentativa de gravar o token em texto
   * puro, que teria outro tamanho. A defesa não depende de ninguém lembrar da regra.
   *
   * Se este banco vazar, os tokens gravados nele não servem para entrar. (INV-06)
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
