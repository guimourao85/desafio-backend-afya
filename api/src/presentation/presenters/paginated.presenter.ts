export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface PaginatedHttpResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * O envelope único de listagem da API (PLAN.md §9.3).
 *
 * Genérico e num arquivo próprio porque a alternativa — cada controller montando o
 * seu — produz o defeito que `review-product.md` trata como ALTO: array cru numa
 * rota e objeto em outra, e o cliente descobrindo caso a caso.
 *
 * `totalPages` nasce aqui, e não no caso de uso: quantas páginas existem é
 * aritmética de apresentação, derivada de dois números que o domínio já devolveu.
 * No service, seria formato de página infiltrado na regra; no controller, seria a
 * mesma divisão reescrita em toda rota paginada futura.
 */
export class PaginatedPresenter {
  static toHttp<TEntity, TResponse>(
    items: TEntity[],
    total: number,
    page: number,
    perPage: number,
    present: (item: TEntity) => TResponse,
  ): PaginatedHttpResponse<TResponse> {
    return {
      data: items.map(present),
      meta: {
        page,
        perPage,
        total,
        // Base vazia devolve `0`, não `1`: dizer que existe uma página quando não
        // há nenhuma faria o cliente pedir a página 1 de nada.
        totalPages: Math.ceil(total / perPage),
      },
    };
  }
}
