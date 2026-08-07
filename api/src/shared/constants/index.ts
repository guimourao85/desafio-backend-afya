/**
 * Token de DI do `DataSource` (PLAN.md §11.6). Quem precisa de conexão injeta
 * este símbolo: singleton alcançável por import é service locator, e some do
 * grafo de dependências do Nest.
 */
export const PRONTOMED_POSTGRES_DATA_SOURCE = 'PRONTOMED_POSTGRES_DATA_SOURCE';
