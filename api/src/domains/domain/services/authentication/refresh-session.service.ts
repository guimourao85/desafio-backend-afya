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
 * A mesma resposta para as três formas de um refresh não valer: inexistente,
 * expirado e revogado. Distinguir diria a quem tem um palpite qual dos três ele
 * acertou — e o cliente faz a mesma coisa nos três casos (novo login).
 */
const INVALID_REFRESH_MESSAGE = 'Sessão expirada. Faça login novamente.';

/**
 * Mesmo texto do 401 do `JwtAuthGuard`. A duplicação do literal é consciente
 * (ADR-06 recusa catálogo de mensagens): o domínio não importa `framework/`.
 */
const UNAUTHENTICATED_MESSAGE = 'Autenticação necessária.';

/**
 * Renova o access token a partir de um refresh válido (PLAN.md §8.2).
 *
 * **Não há rotação** (ADR-11): o refresh não muda de estado aqui. Duas chamadas
 * concorrentes — duas abas, um retry — devolvem dois access tokens válidos e
 * ninguém perde a sessão. Essa é a simplificação que torna a operação idempotente
 * de graça.
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
    // O cru vira hash **aqui**, antes de qualquer ida ao banco (INV-06). A porta
    // recebe hash e nada mais — é o que impede o valor cru de escorregar para uma
    // consulta e, dali, para uma coluna.
    const session = await this.refreshTokenRepository.findValidByHash(
      this.tokenIssuer.hashRefreshToken(refreshToken),
    );

    if (!session) {
      return left(new InvalidRefreshTokenError(INVALID_REFRESH_MESSAGE));
    }

    // O `email` vai no payload do access e não está guardado na sessão: buscar o
    // médico é o que impede uma cópia desnormalizada que envelhece.
    const doctor = await this.doctorRepository.findById(session.doctorId);

    if (!doctor) {
      // Sessão válida apontando para ninguém: quem não vale mais é a **sessão**,
      // não um recurso ausente — daí 401, e não o 404 de INV-04, que fala de dado
      // de outro médico.
      return left(new UnauthenticatedError(UNAUTHENTICATED_MESSAGE));
    }

    const { token: accessToken, expiresInSeconds } = await this.tokenIssuer.issueAccessToken({
      sub: doctor.id,
      email: doctor.email,
    });

    return right({ accessToken, expiresIn: expiresInSeconds });
  }
}
