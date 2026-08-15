// Valores por defecto de paginación. Centralizados aquí (no en el DTO como
// property initializer) porque la supervivencia de un initializer a través de
// plainToInstance depende de la versión de class-transformer; una función
// pura es directamente testeable y es la única fuente de verdad del default.
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

export interface PaginationQueryLike {
  page?: number;
  limit?: number;
}

export interface ResolvedPagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

// Resuelve page/limit con sus defaults y deriva skip/take para TypeORM.
export function resolvePagination(query: PaginationQueryLike): ResolvedPagination {
  const page = query.page ?? DEFAULT_PAGE;
  const limit = query.limit ?? DEFAULT_LIMIT;
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}
