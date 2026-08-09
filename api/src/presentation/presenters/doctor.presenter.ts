import { DoctorProfile } from '@/domains/domain/services/authentication/get-profile.service';

/** O corpo de `GET /api/auth/me` (PLAN.md §9). */
export interface DoctorHttpResponse {
  id: string;
  name: string;
  email: string;
}

/**
 * A via de saída do médico (INV-07).
 *
 * A segunda barreira, não a única: o caso de uso já devolve `DoctorProfile` em vez
 * da entity, então `passwordHash` nem chega até aqui. Duas camadas para a mesma
 * regra é de propósito — a que falha sozinha é sempre a que se esquece.
 */
export class DoctorPresenter {
  static toHttp(profile: DoctorProfile): DoctorHttpResponse {
    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
    };
  }
}
