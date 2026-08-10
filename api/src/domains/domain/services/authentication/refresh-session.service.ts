import { Inject, Injectable } from '@nestjs/common';

import { DOCTORS_REPOSITORY, REFRESH_TOKENS_REPOSITORY } from '@/shared/constants/repositories';
import { Either, left, right } from '@/shared/errors/either';
import { InvalidRefreshTokenError, UnauthenticatedError } from '@/shared/errors/types';
import { TokenIssuer } from '@/shared/interfaces/cryptography/token-issuer';

import { DoctorRepository } from '../../repositories/doctor.repository';
import { RefreshTokenRepository } from '../../repositories/refresh-token.repository';

export interface RefreshSessionRequest {
  refreshToken: string;
}

export interface RefreshSessionResponse {
  accessToken: string;
  expiresIn: number;
}

export type RefreshSessionResult = Either<
  InvalidRefreshTokenError | UnauthenticatedError,
  RefreshSessionResponse
>;

/**
 * A mesma resposta para todas as formas de um refresh não valer: inexistente,
 * expirado, revogado — ou um token que nunca foi um refresh, como o accessToken
 * colado no campo errado. Distinguir diria a quem tem um palpite qual dos casos
 * ele acertou — e o cliente faz a mesma coisa em todos (novo login). O texto não
 * afirma causa nenhuma pelo mesmo motivo: "sessão expirada" sozinho mentia para
 * quem só colou o token errado.
 */
const INVALID_REFRESH_MESSAGE = 'Refresh token inválido ou sessão expirada. Faça login novamente.';

/**
 * O mesmo texto que o guard de autenticação usa no 401 dele. O literal está
 * repetido de propósito: um catálogo central de mensagens faria o domínio depender
 * da camada de framework, e isso custa mais do que a repetição. (ADR-06)
 */
const UNAUTHENTICATED_MESSAGE = 'Autenticação necessária.';

/**
 * Renova o access token a partir de um refresh válido.
 *
 * **O refresh não é trocado aqui** — ele continua o mesmo até expirar ou até o
 * logout. A consequência prática é boa: duas abas renovando ao mesmo tempo, ou um
 * retry de rede, devolvem dois access válidos e nenhuma das duas perde a sessão. É
 * uma simplificação que sai de graça: repetir a operação não quebra nada.
 *
 * O preço declarado: um refresh roubado vale até expirar, porque não existe o
 * mecanismo de "usou uma vez, o antigo morre" que denunciaria o roubo.
 *
 * Mais detalhes: PLAN.md §8.2 · PRODUCT.md — ADR-11, INV-06.
 */
@Injectable()
export class RefreshSessionService {
  constructor(
    @Inject(DOCTORS_REPOSITORY)
    private readonly doctorRepository: DoctorRepository,
    @Inject(REFRESH_TOKENS_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly tokenIssuer: TokenIssuer,
  ) {}

  async execute({ refreshToken }: RefreshSessionRequest): Promise<RefreshSessionResult> {
    // O token em texto puro vira hash **aqui**, antes de qualquer ida ao banco. O
    // contrato de persistência só aceita hash — é o que impede o valor cru de
    // escorregar para dentro de uma consulta e, dali, para uma coluna. (INV-06)
    const session = await this.refreshTokenRepository.findValidByHash(
      this.tokenIssuer.hashRefreshToken(refreshToken),
    );

    if (!session) {
      return left(new InvalidRefreshTokenError(INVALID_REFRESH_MESSAGE));
    }

    // O email entra no novo access token, e ele não está guardado na sessão. Buscar
    // o médico agora é o que evita uma cópia que envelhece: se ele trocasse o email,
    // uma cópia guardada continuaria repetindo o antigo.
    const doctor = await this.doctorRepository.findById(session.doctorId);

    if (!doctor) {
      // Sessão válida apontando para um médico que não existe mais. Quem deixou de
      // valer é a **sessão**, não um recurso que sumiu — por isso 401 ("faça login
      // de novo") e não 404.
      return left(new UnauthenticatedError(UNAUTHENTICATED_MESSAGE));
    }

    const { token: accessToken, expiresInSeconds } = await this.tokenIssuer.issueAccessToken({
      sub: doctor.id,
      email: doctor.email,
    });

    return right({ accessToken, expiresIn: expiresInSeconds });
  }
}
