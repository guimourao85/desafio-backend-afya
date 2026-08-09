import { Doctor } from '../model-entities/doctor.entity';

/**
 * A porta de persistência do médico. Mora no domínio porque o contrato é do
 * domínio; a implementação, em `infrastructure/` — a dependência aponta para
 * dentro.
 *
 * Nasce com um método só. Repositório não é CRUD por antecipação: cada método
 * existe porque um caso de uso o chama.
 */
export interface DoctorRepository {
  /** O email chega **já normalizado** pela borda — a comparação é literal. */
  findByEmail(email: string): Promise<Doctor | null>;

  /**
   * Busca pelo `sub` do token. Sem filtro por dono: o médico **é** o dono, e
   * INV-04 fala de escopar dado de terceiros — não de o médico se ler.
   */
  findById(id: string): Promise<Doctor | null>;
}
