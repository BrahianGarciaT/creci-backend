export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Envelope genérico de respuesta paginada. Sigue la misma convención de
// mapper explícito `static from(...)` que ProjectResponseDto/TaskResponseDto.
export class PaginatedResponseDto<T> {
  data: T[];
  meta: PageMeta;

  static from<T>(
    items: T[],
    total: number,
    { page, limit }: { page: number; limit: number },
  ): PaginatedResponseDto<T> {
    const dto = new PaginatedResponseDto<T>();
    dto.data = items;
    dto.meta = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
    return dto;
  }
}
