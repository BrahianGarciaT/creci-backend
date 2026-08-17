import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Query params de GET /tasks/project/:projectId: paginación base +
// `all` opcional para pedir el proyecto completo sin skip/take.
export class ProjectTaskListQueryDto extends PaginationQueryDto {
  // Los query params llegan siempre como string ('true'/'false') o ausentes.
  // @Type(() => Boolean) es una trampa acá: Boolean('false') === true, lo que
  // haría que `all=false` se comporte igual que `all=true`.
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  all?: boolean;
}
