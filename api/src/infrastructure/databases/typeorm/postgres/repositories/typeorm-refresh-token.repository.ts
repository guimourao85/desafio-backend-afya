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
}
