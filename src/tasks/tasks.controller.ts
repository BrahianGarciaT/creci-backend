import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { User, UserRole } from '../users/users.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { ProjectTaskListQueryDto } from './dto/project-task-list-query.dto';
import { ReorderColumnDto } from './dto/reorder-column.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { UpdateEstimateDto } from './dto/update-estimate.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
@UseGuards(RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // POST /tasks — crea una tarea (solo admin)
  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateTaskDto): Promise<TaskResponseDto> {
    return this.tasksService.create(dto);
  }

  // GET /tasks/project/:projectId — tareas del proyecto para un miembro developer
  // o para admin (project-scoped), paginadas salvo que se pida `all=true`.
  // IMPORTANTE: debe registrarse ANTES de GET /tasks/:id para evitar que NestJS
  // interprete "project" como el valor del parámetro :id
  @Get('project/:projectId')
  findByProject(
    @Param('projectId') projectId: string,
    @CurrentUser() currentUser: User,
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: ProjectTaskListQueryDto,
  ): Promise<PaginatedResponseDto<TaskResponseDto>> {
    return this.tasksService.findByProject(projectId, currentUser, query);
  }

  // PATCH /tasks/project/:projectId/reorder — persiste el nuevo orden visual
  // de una columna del kanban tras un drag-and-drop (JWT, cualquier miembro del proyecto)
  @Patch('project/:projectId/reorder')
  @HttpCode(204)
  reorderColumn(
    @Param('projectId') projectId: string,
    @Body() dto: ReorderColumnDto,
    @CurrentUser() currentUser: User,
  ): Promise<void> {
    return this.tasksService.reorderColumn(projectId, dto, currentUser);
  }

  // PATCH /tasks/:id — actualización parcial de cualquier campo (solo admin)
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.update(id, dto);
  }

  // PATCH /tasks/:id/status — el asignado actualiza el status (JWT, no CANCELLED)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() currentUser: User,
  ): Promise<TaskResponseDto> {
    return this.tasksService.updateStatus(id, dto, currentUser);
  }

  // PATCH /tasks/:id/estimate — el asignado actualiza la estimación de horas
  @Patch(':id/estimate')
  updateEstimate(
    @Param('id') id: string,
    @Body() dto: UpdateEstimateDto,
    @CurrentUser() currentUser: User,
  ): Promise<TaskResponseDto> {
    return this.tasksService.updateEstimate(id, dto, currentUser);
  }

  // DELETE /tasks/:id — soft-cancel (solo admin); la fila se conserva con status CANCELLED
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  softCancel(@Param('id') id: string): Promise<TaskResponseDto> {
    return this.tasksService.softCancel(id);
  }
}
