import { DomainError } from './domain-error';

/**
 * O catálogo de PLAN.md §9.4 inteiro, nascido antes de existir quem lançasse cada
 * código: mudar o contrato de erro com a API inteira no ar é mexer em tudo.
 *
 * `VALIDATION_ERROR` e `INTERNAL_ERROR` não têm classe — o filtro os produz
 * direto, e ninguém os lança.
 */

/** 401 — email ou senha incorretos. Nunca diz *qual* dos dois errou. */
export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';
}

/** 401 — sem token, token inválido ou expirado. */
export class UnauthenticatedError extends DomainError {
  readonly code = 'UNAUTHENTICATED';
}

/** 401 — refresh inexistente, expirado ou revogado. */
export class InvalidRefreshTokenError extends DomainError {
  readonly code = 'INVALID_REFRESH_TOKEN';
}

/** 404 — inexistente **ou de outro médico** (INV-04): os dois respondem igual. */
export class ResourceNotFoundError extends DomainError {
  readonly code = 'RESOURCE_NOT_FOUND';
}

/** 409 — horário ocupado (INV-01). */
export class ScheduleConflictError extends DomainError {
  readonly code = 'SCHEDULE_CONFLICT';
}

/** 422 — payload válido, regra de negócio violada (INV-02, INV-05). */
export class BusinessRuleViolationError extends DomainError {
  readonly code = 'BUSINESS_RULE_VIOLATION';
}

export { DomainError };
export type { DomainErrorCode, ErrorCode } from './domain-error';
