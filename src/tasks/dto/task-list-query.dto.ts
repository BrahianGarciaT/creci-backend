import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TaskPriority, TaskStatus } from '../tasks.entity';

// Query params de GET /tasks: paginación base + filtros opcionales
// (projectId, status, priority), todos ANDados y aplicados antes de paginar.
export class TaskListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
}
