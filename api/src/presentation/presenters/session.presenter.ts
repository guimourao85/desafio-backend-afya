import { AuthenticateDoctorResponse } from '@/domains/domain/services/authentication/authenticate-doctor.service';

/** O corpo de resposta de toda rota que abre ou renova sessão (PLAN.md §9). */
export interface SessionHttpResponse {
  accessToken: string;
  refreshToken: string;
  /** Validade do **access** token, em segundos. */
  expiresIn: number;
}

/**
 * A única via de serialização de uma sessão (INV-07).
 *
 * A regra que ele existe para garantir é negativa: `password_hash` e `token_hash`
 * **nunca** saem numa resposta. Devolver o objeto do caso de uso direto funcionaria
 * hoje e vazaria no dia em que alguém acrescentasse um campo — o presenter é o
 * lugar onde essa adição vira uma escolha explícita em vez de um acidente.
 */
export class SessionPresenter {
  static toHttp(session: AuthenticateDoctorResponse): SessionHttpResponse {
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
    };
  }
}
