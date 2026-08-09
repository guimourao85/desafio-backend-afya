import { Inject, Injectable } from '@nestjs/common';

import { REFRESH_TOKENS_REPOSITORY } from '@/shared/constants/repositories';
import { TokenIssuer } from '@/shared/interfaces/cryptography/token-issuer';

import { RefreshTokenRepository } from '../../repositories/refresh-token.repository';

export interface RevokeSessionRequest {
  refreshToken: string;
}

/**
 * Encerra a sessão (PLAN.md §8.2).
 *
 * **Devolve `void`, não `Either`.** `Either` existe para obrigar quem chama a
 * tratar o erro esperado, e este caso de uso não tem nenhum: logout responde 204
 * com token válido, desconhecido, expirado ou já revogado. Um `Left` de tipo
 * `never` seria ruído que ensina o padrão errado para as fases seguintes.
 *
 * **O que ele não faz:** derrubar o access token corrente. O access é
 * auto-validável e o guard não consulta o banco — quem já tem um em mãos continua
 * entrando por até 15 minutos. O que o logout garante é que a sessão **não se
 * renova**; em ≤ 15 min ela morre sozinha. Encurtar essa janela exigiria lista de
 * bloqueio consultada em toda rota, que é a consulta por requisição que o JWT
 * existe para evitar (DEBT-11).
 */
@Injectable()
export class RevokeSessionService {
  constructor(
    @Inject(REFRESH_TOKENS_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly tokenIssuer: TokenIssuer,
  ) {}

  async execute({ refreshToken }: RevokeSessionRequest): Promise<void> {
    // Não pergunta se achou: o `UPDATE` já é a resposta inteira, e ler antes só
    // produziria uma informação que ninguém pode usar sem virar oráculo.
    await this.refreshTokenRepository.revokeByHash(this.tokenIssuer.hashRefreshToken(refreshToken));
  }
}
