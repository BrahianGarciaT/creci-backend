import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProjectTaskListQueryDto } from './project-task-list-query.dto';

describe('ProjectTaskListQueryDto', () => {
  it('acepta all ausente', async () => {
    const dto = plainToInstance(ProjectTaskListQueryDto, {});

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.all).toBeUndefined();
  });

  it('coacciona all="true" a boolean true', async () => {
    const dto = plainToInstance(ProjectTaskListQueryDto, { all: 'true' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.all).toBe(true);
  });

  it('coacciona all="false" a boolean false (no a true)', async () => {
    // Regresión: @Type(() => Boolean) haría Boolean('false') === true.
    const dto = plainToInstance(ProjectTaskListQueryDto, { all: 'false' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.all).toBe(false);
  });

  it('acepta all=true booleano nativo', async () => {
    const dto = plainToInstance(ProjectTaskListQueryDto, { all: true });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.all).toBe(true);
  });

  it('coacciona cualquier otro string (ej. "yes") a boolean false', async () => {
    // El Transform siempre devuelve boolean, así que @IsBoolean() nunca
    // rechaza `all`: un valor inesperado se trata como "no pedir todo",
    // nunca como error de validación.
    const dto = plainToInstance(ProjectTaskListQueryDto, { all: 'yes' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.all).toBe(false);
  });

  it('sigue validando page/limit heredados de PaginationQueryDto', async () => {
    const dto = plainToInstance(ProjectTaskListQueryDto, { limit: 500 });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
  });
});
