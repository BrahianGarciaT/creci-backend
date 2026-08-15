import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Query params de GET /tasks: paginación base + projectId ya existente.
// status/priority se agregan en una fase posterior (server-side filtering).
export class TaskListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
