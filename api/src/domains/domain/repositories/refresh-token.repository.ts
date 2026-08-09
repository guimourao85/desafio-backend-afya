import { RefreshToken } from '../model-entities/refresh-token.entity';

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
 * A porta de persistência do refresh token.
 *
 * Os três métodos falam em **hash**, nunca em token — o nome do parâmetro é a
 * primeira barreira de INV-06. Quem passar o valor cru aqui não encontra nada, e
 * o conserto intuitivo de quem não conhece a regra seria gravar o cru.
 */
export interface RefreshTokenRepository {
  create(data: CreateRefreshTokenData): Promise<void>;

  /** Válido = existe, **não** revogado e **não** expirado. O relógio é o do banco. */
  findValidByHash(hash: string): Promise<RefreshToken | null>;

  /**
   * Revoga se achar; cala se não achar. Não devolve nada de propósito: logout
   * responde 204 nos dois casos, e distinguir seria um oráculo de "este token
   * existe" para quem só tem palpite.
   */
  revokeByHash(hash: string): Promise<void>;
}
