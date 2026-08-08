/** O que vai dentro do access token. `sub` é o `doctorId` — é dele que sai o escopo (INV-04). */
export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface IssuedAccessToken {
  token: string;
  /**
   * O TTL **em segundos**, para o `expiresIn` do contrato HTTP.
   *
   * Vem junto do token de propósito (divergindo de PLAN.md §8.4, que devolvia só a
   * string): quem conhece o TTL é o adapter, que lê `JWT_ACCESS_TTL='15m'`. Sem
   * este campo, alguém converte `'15m'` em `900` fora da porta — parsing de formato
   * de lib vazando para o caso de uso.
   */
  expiresInSeconds: number;
}

/**
 * A porta de emissão de token (PLAN.md §8.4). Cobre os dois tipos, que são coisas
 * diferentes: o access é um JWT assinado e **irrevogável** até expirar; o refresh é
 * opaco, aleatório e vive no banco — só o SHA-256 dele (INV-06).
 */
export abstract class TokenIssuer {
  abstract issueAccessToken(payload: AccessTokenPayload): Promise<IssuedAccessToken>;

  /** Segredo aleatório de 32 bytes, base64url. Nunca um UUID: formato previsível. */
  abstract generateRefreshToken(): string;

  /** SHA-256 hex — a única forma do refresh que pode tocar o banco (INV-06). */
  abstract hashRefreshToken(token: string): string;
}
