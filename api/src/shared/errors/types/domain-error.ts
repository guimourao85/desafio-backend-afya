/** Os `code` que um erro de domínio pode carregar (PLAN.md §9.4). */
export type DomainErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'INVALID_REFRESH_TOKEN'
  | 'RESOURCE_NOT_FOUND'
  | 'SCHEDULE_CONFLICT'
  | 'BUSINESS_RULE_VIOLATION';

/** O catálogo inteiro: os do domínio, mais os dois que só o filtro produz. */
export type ErrorCode = DomainErrorCode | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

/**
 * Raiz de todo erro esperado do domínio (PLAN.md §11.2). O `code` é contrato
 * público — é contra ele que o cliente programa, não contra a mensagem, que é
 * texto para humano e pode mudar sem quebrar ninguém.
 *
 * O tipo fechado é o que faz o compilador cobrar o mapeamento no filtro: um `code`
 * novo sem status vira erro de build, não um 500 em produção.
 */
export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  constructor(message: string) {
    super(message);
    // Sem isto todo erro se chamaria `Error` no log.
    this.name = new.target.name;
  }
}
