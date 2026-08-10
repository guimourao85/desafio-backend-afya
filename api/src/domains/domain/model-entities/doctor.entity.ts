import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * O médico — o dono de absolutamente todo dado deste sistema. Paciente, consulta e
 * anotação existem sempre dentro do consultório de um médico, nunca soltos.
 *
 * É uma classe só, que serve ao mesmo tempo de modelo de negócio e de mapa da
 * tabela. A alternativa seria manter duas classes espelhadas e sincronizá-las à
 * mão — custo permanente, num sistema deste tamanho, sem ganho real.
 *
 * Os nomes das restrições do banco (`pk_`, `uk_`) estão escritos à mão de propósito.
 * Calado, o gerador inventa nomes com hash, e nome de restrição é contrato: é por
 * ele que uma migration futura e o diagnóstico de erro do driver se orientam.
 *
 * Mais detalhes: PRODUCT.md — INV-04, ADR-03.
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

  /**
   * Chega aqui já em minúsculas e sem espaços nas pontas — a limpeza acontece na
   * entrada da requisição, nunca aqui. Sem isso, ` Medico@X ` e `medico@x` seriam
   * duas contas diferentes para o banco, e o login falharia por um motivo invisível.
   */
  @Column({ name: 'email', type: 'varchar', length: 255 })
  email!: string;

  /**
   * A senha embaralhada — nunca a senha em si, que o sistema não guarda em lugar
   * nenhum. Este campo **nunca** sai numa resposta da API: a última camada antes do
   * JSON é a barreira, e o caso de uso já nem o carrega até lá. (INV-07)
   */
  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
