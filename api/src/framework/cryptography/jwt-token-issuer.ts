import { randomBytes, createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import {
  AccessTokenPayload,
  IssuedAccessToken,
  TokenIssuer,
} from '@/shared/interfaces/cryptography/token-issuer';

/** 32 bytes = 256 bits de entropia. `randomUUID()` daria 122 e formato previsível. */
const REFRESH_TOKEN_BYTES = 32;

/**
 * A implementação concreta da porta de token: `@nestjs/jwt` para o access,
 * `node:crypto` para o refresh. Este é o único arquivo do projeto que conhece as
 * duas libs — o caso de uso vê só `TokenIssuer`.
 */
@Injectable()
export class JwtTokenIssuer implements TokenIssuer {
  constructor(private readonly jwtService: JwtService) {}

  async issueAccessToken(payload: AccessTokenPayload): Promise<IssuedAccessToken> {
    // Segredo e `expiresIn` vêm do `JwtModule.registerAsync` — que os lê do
    // `EnvironmentService`. Nada de `process.env` aqui.
    const token = await this.jwtService.signAsync(payload);

    // O TTL em segundos sai do **próprio token**, não de um parser de `'15m'`
    // escrito à mão. Se `JWT_ACCESS_TTL` mudar, o `expiresIn` da resposta muda
    // junto, sem uma segunda fonte de verdade para divergir.
    const { exp, iat } = this.jwtService.decode<{ exp: number; iat: number }>(token);

    return { token, expiresInSeconds: exp - iat };
  }

  generateRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  /**
   * SHA-256 sem sal e sem custo, de propósito: o refresh já é um segredo aleatório
   * de 256 bits — não há dicionário para atacar, e o hash precisa ser determinístico
   * para a busca por `token_hash` de 02.02 encontrar a linha em uma consulta.
   * Bcrypt aqui inviabilizaria o lookup.
   */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
