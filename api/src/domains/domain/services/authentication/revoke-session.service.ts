import { Inject, Injectable } from '@nestjs/common';

import { REFRESH_TOKENS_REPOSITORY } from '@/shared/constants/repositories';
import { TokenIssuer } from '@/shared/interfaces/cryptography/token-issuer';

import { RefreshTokenRepository } from '../../repositories/refresh-token.repository';

export interface RevokeSessionRequest {
  refreshToken: string;
}

/**
 * Encerra a sessão.
 *
 * **Não devolve erro nenhum**, porque não existe forma de o logout falhar: token
 * válido, desconhecido, expirado ou já revogado respondem todos 204. Nada a
 * informar — em qualquer um dos casos o cliente joga o token fora.
 *
 * **O que ele não faz:** derrubar o access token que já está na mão de alguém. O
 * access se valida sozinho, sem consultar o banco, então quem tem um continua
 * entrando por até 15 minutos. O que o logout garante é que a sessão **não se
 * renova** — depois disso ela morre sozinha.
 *
 * Encurtar essa janela exigiria consultar uma lista de bloqueio em toda requisição,
 * que é exatamente o custo por requisição que este desenho existe para evitar. O
 * débito está registrado, não esquecido.
 *
 * Mais detalhes: PLAN.md §8.2 · DEBITOS-TECNICOS.md — DEBT-11.
 */
@Injectable()
export class RevokeSessionService {
  constructor(
    @Inject(REFRESH_TOKENS_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly tokenIssuer: TokenIssuer,
  ) {}

  async execute({ refreshToken }: RevokeSessionRequest): Promise<void> {
    // Não pergunta se achou antes de revogar: a gravação já é a resposta inteira.
    // Ler primeiro só produziria a informação "este token existe" — que ninguém
    // aqui pode usar, e que responder ao cliente entregaria de graça a quem só
    // tivesse um palpite.
    await this.refreshTokenRepository.revokeByHash(this.tokenIssuer.hashRefreshToken(refreshToken));
  }
}
