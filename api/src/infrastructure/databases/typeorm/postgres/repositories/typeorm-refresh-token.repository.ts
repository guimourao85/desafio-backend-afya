import { DataSource, Repository } from 'typeorm';

import { RefreshToken } from '@/domains/domain/model-entities/refresh-token.entity';
import {
  CreateRefreshTokenData,
  RefreshTokenRepository,
} from '@/domains/domain/repositories/refresh-token.repository';

/**
 * O adapter TypeORM da porta de refresh token.
 *
 * Uma escrita, um agregado, sem transação explícita: o `insert` de uma linha já é
 * atômico. Transação existiria se houvesse duas escritas a manter consistentes — e
 * viveria aqui, nunca no caso de uso.
 */
export class TypeOrmRefreshTokenRepository implements RefreshTokenRepository {
  private readonly repository: Repository<RefreshToken>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(RefreshToken);
  }

  async create(data: CreateRefreshTokenData): Promise<void> {
    // `insert` e não `save`: `save` faz um SELECT antes para decidir entre inserir e
    // atualizar. Aqui a decisão já está tomada, e a ida a mais ao banco não paga nada.
    await this.repository.insert(data);
  }

  /**
   * `QueryBuilder` e não `findOne` por causa do `now()`: `MoreThan(new Date())`
   * compararia com o relógio do **processo**, e a coluna foi escrita com o relógio
   * do **banco**. Duas fontes de tempo para uma pergunta só é como se aceita um
   * token vencido em um servidor e se recusa no outro.
   */
  findValidByHash(hash: string): Promise<RefreshToken | null> {
    return this.repository
      .createQueryBuilder('refreshToken')
      // Com alias, o nome é o da **propriedade** — o TypeORM traduz para a coluna.
      .where('refreshToken.tokenHash = :hash', { hash })
      .andWhere('refreshToken.revokedAt IS NULL')
      .andWhere('refreshToken.expiresAt > now()')
      .getOne();
  }

  async revokeByHash(hash: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(RefreshToken)
      // `() => 'now()'` grava o instante do banco, e não o do processo.
      .set({ revokedAt: () => 'now()' })
      // No `UPDATE` não há alias: aqui o nome é o da **coluna**, não o da propriedade.
      .where('token_hash = :hash', { hash })
      // Preserva o instante da primeira revogação: logout repetido não reescreve
      // a data, e a linha continua contando a verdade sobre quando a sessão morreu.
      .andWhere('revoked_at IS NULL')
      .execute();
  }
}
