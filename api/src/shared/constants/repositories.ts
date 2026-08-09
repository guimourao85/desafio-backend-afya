/**
 * Tokens de DI das portas de repositório (PLAN.md §10). Arquivo próprio, separado
 * do `index.ts`: lá mora o token do `DataSource`, que é infraestrutura — aqui, o
 * contrato que o domínio publica e a infraestrutura implementa. Misturar os dois
 * num barril só apaga essa fronteira.
 *
 * Quem injeta o token recebe o **adapter** que implementa a porta, nunca um
 * `Repository<T>` cru (ADR-02).
 */
export const DOCTORS_REPOSITORY = 'DOCTORS_REPOSITORY';

export const REFRESH_TOKENS_REPOSITORY = 'REFRESH_TOKENS_REPOSITORY';

export const PATIENTS_REPOSITORY = 'PATIENTS_REPOSITORY';
