import { RefreshSessionResponse } from '@/domains/domain/services/authentication/refresh-session.service';

/** O corpo de `POST /api/auth/refresh` (PLAN.md §9). */
export interface AccessTokenHttpResponse {
  accessToken: string;
  /** Validade do access token, em segundos. */
  expiresIn: number;
}

/**
 * Presenter próprio, e não reuso do `SessionPresenter`.
 *
 * Sem rotação (ADR-11) o refresh **não muda** ao ser usado. Devolvê-lo de novo
 * sugeriria que mudou, e o cliente guardaria como "novo" um valor idêntico ao que
 * já tinha — contrato mentindo sobre o que o servidor fez. O que a renovação
 * produz é um access token, e é só isso que sai daqui.
 */
export class AccessTokenPresenter {
  static toHttp(session: RefreshSessionResponse): AccessTokenHttpResponse {
    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
    };
  }
}
