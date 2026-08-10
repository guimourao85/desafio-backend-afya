import { Doctor } from '../model-entities/doctor.entity';

/**
 * O contrato de acesso à tabela de médicos.
 *
 * O contrato mora aqui, junto das regras; quem sabe falar com o Postgres mora na
 * pasta de infraestrutura. A dependência aponta para dentro — a regra não conhece o
 * banco, o banco é que conhece a regra.
 *
 * Nasceu com um método só, e isso é intencional: repositório não é CRUD por
 * antecipação. Cada método existe porque **algum caso de uso o chama**. Método sem
 * chamador é superfície aberta de graça.
 */
export interface DoctorRepository {
  /** O email chega **já normalizado** pela borda — a comparação é literal. */
  findByEmail(email: string): Promise<Doctor | null>;

  /**
   * Busca pelo id que veio dentro do token.
   *
   * Este é o único método do sistema que busca **sem** filtrar por médico dono — e
   * a exceção é coerente: aqui o médico é o dono. A regra de isolamento existe para
   * impedir que ele leia dado de terceiros, não para impedir que ele se leia.
   */
  findById(id: string): Promise<Doctor | null>;
}
