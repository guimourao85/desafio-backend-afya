/**
 * O que o caso de uso entrega para persistir. Note o que **não** está aqui: o token
 * em claro. O service já hasheia antes de chamar — a porta é estreita o bastante
 * para que gravar o valor cru exija mudar esta assinatura (INV-06).
 */
export interface CreateRefreshTokenData {
  doctorId: string;
  /** SHA-256 hex, 64 caracteres. */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * A porta de persistência do refresh token. Só `create` nesta sprint:
 * `findValidByHash` e `revokeByHash` nascem em 02.02, junto dos casos de uso que
 * os chamam.
 */
export interface RefreshTokenRepository {
  create(data: CreateRefreshTokenData): Promise<void>;
}
