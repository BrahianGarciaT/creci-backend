import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { PaginatedResponseDto } from './dto/paginated-response.dto';
import { resolvePagination } from './pagination';

describe('resolvePagination', () => {
  it('aplica page=1 y limit=20 por defecto cuando no se provee nada', () => {
    const result = resolvePagination({});

    expect(result).toEqual({ page: 1, limit: 20, skip: 0, take: 20 });
  });

  it('calcula skip/take a partir de page/limit provistos', () => {
    const result = resolvePagination({ page: 3, limit: 10 });

    expect(result).toEqual({ page: 3, limit: 10, skip: 20, take: 10 });
  });

  it('respeta page/limit provistos aunque uno esté ausente', () => {
    expect(resolvePagination({ page: 2 })).toEqual({ page: 2, limit: 20, skip: 20, take: 20 });
    expect(resolvePagination({ limit: 5 })).toEqual({ page: 1, limit: 5, skip: 0, take: 5 });
  });
});

describe('PaginationQueryDto', () => {
  it('acepta page/limit ausentes', async () => {
    const dto = plainToInstance(PaginationQueryDto, {});

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rechaza limit=500 por exceder el máximo de 100', async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: 500 });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
  });

  it('rechaza page=abc por no ser numérico', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: 'abc' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('page');
  });
});

describe('PaginatedResponseDto.from', () => {
  it('calcula totalPages redondeando hacia arriba', () => {
    const result = PaginatedResponseDto.from(['a', 'b'], 25, { page: 1, limit: 20 });

    expect(result.data).toEqual(['a', 'b']);
    expect(result.meta).toEqual({ total: 25, page: 1, limit: 20, totalPages: 2 });
  });

  it('devuelve totalPages=0 cuando total es 0', () => {
    const result = PaginatedResponseDto.from([], 0, { page: 1, limit: 20 });

    expect(result.meta.totalPages).toBe(0);
  });
});
