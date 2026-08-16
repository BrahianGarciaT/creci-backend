import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { resolvePagination } from '../common/pagination';
import { Project } from '../projects/projects.entity';
import { ProjectAccessService } from '../projects/project-access.service';
import { User } from '../users/users.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { ProjectTaskListQueryDto } from './dto/project-task-list-query.dto';
import { ReorderColumnDto } from './dto/reorder-column.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { UpdateEstimateDto } from './dto/update-estimate.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { isStatusTransitionAllowed, Task, TaskStatus } from './tasks.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly projectAccessService: ProjectAccessService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TasksService.name);
  }

  // Crea una tarea; valida que el proyecto exista y opcionalmente carga el asignado
  async create(dto: CreateTaskDto): Promise<TaskResponseDto> {
    if (dto.assigneeId) {
      const assignee = await this.usersRepository.findOne({
        where: { id: dto.assigneeId },
      });
      if (!assignee) throw new NotFoundException('Assignee not found');
    }

    await this.loadProjectAndAssertMembership(
      dto.projectId,
      dto.assigneeId ?? null,
    );

    const task = this.tasksRepository.create({
      title: dto.title,
      description: dto.description ?? null,
      priority: dto.priority,
      projectId: dto.projectId,
      assigneeId: dto.assigneeId ?? null,
      estimatedHours: dto.estimatedHours ?? null,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      position: await this.nextPositionInColumn(dto.projectId, TaskStatus.TODO),
    });

    const saved = await this.tasksRepository.save(task);
    this.logger.info(
      { taskId: saved.id, projectId: saved.projectId },
      'Task created',
    );
    return TaskResponseDto.from(saved);
  }

  // Devuelve las tareas de un proyecto (incluidas las canceladas); verifica que el
  // usuario sea miembro del proyecto, o admin (kanban admin también es
  // project-scoped, ver Requirement "Admin project-scoped kanban access").
  // Las canceladas se incluyen a propósito: el dev asignado necesita ver que su
  // tarea fue cancelada en vez de que desaparezca sin rastro; el volumen por dev
  // no crece sin control (sin sprints todavía) así que no amerita filtrarlas.
  // Orden por `position` (orden visual del kanban dentro de cada columna, ver
  // reorderColumn) con createdAt como desempate estable para filas nunca reordenadas.
  // `all=true` devuelve el proyecto completo sin skip/take: un board de kanban
  // se muestra entero, paginarlo lo fragmentaría en columnas incompletas.
  async findByProject(
    projectId: string,
    currentUser: User,
    query: ProjectTaskListQueryDto,
  ): Promise<PaginatedResponseDto<TaskResponseDto>> {
    await this.projectAccessService.assertCanRead(projectId, currentUser, {
      allowAdmin: true,
    });

    if (query.all === true) {
      const tasks = await this.tasksRepository.find({
        where: { projectId },
        relations: { project: true, assignee: true },
        order: { position: 'ASC', createdAt: 'ASC' },
      });
      return PaginatedResponseDto.unpaginated(
        tasks.map((task) => TaskResponseDto.from(task)),
      );
    }

    const { page, limit, skip, take } = resolvePagination(query);
    const [tasks, total] = await this.tasksRepository.findAndCount({
      where: {
        projectId,
      },
      relations: { project: true, assignee: true },
      order: { position: 'ASC', createdAt: 'ASC' },
      skip,
      take,
    });
    return PaginatedResponseDto.from(
      tasks.map((task) => TaskResponseDto.from(task)),
      total,
      {
        page,
        limit,
      },
    );
  }

  // Carga el proyecto con sus developers y valida que el asignado (si hay) sea miembro
  private async loadProjectAndAssertMembership(
    projectId: string,
    assigneeId: string | null,
  ): Promise<Project> {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
      relations: { developers: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (assigneeId && !project.developers.some((d) => d.id === assigneeId)) {
      throw new BadRequestException(
        'El desarrollador asignado no pertenece al proyecto seleccionado',
      );
    }
    return project;
  }

  // Lanza BadRequestException si la transición de estado solicitada no está permitida
  // (una tarea done es terminal, salvo el no-op done -> done)
  private assertStatusTransitionAllowed(
    current: TaskStatus,
    next: TaskStatus,
  ): void {
    if (!isStatusTransitionAllowed(current, next)) {
      throw new BadRequestException(
        'A completed task cannot change status. Create a new task instead.',
      );
    }
  }

  // Posición al final de una columna (projectId+status) — usada al crear una tarea
  // y en cada cambio de status, para que la tarea entrante nunca colisione con
  // el `position` de una ya existente en su columna destino. Es segura sin
  // reconsultar el máximo real porque `reorderColumn` siempre renumera el set
  // completo de la columna como 0..n-1: el COUNT nunca deja huecos.
  private async nextPositionInColumn(
    projectId: string,
    status: TaskStatus,
  ): Promise<number> {
    return this.tasksRepository.count({ where: { projectId, status } });
  }

  // Estampa completedAt la primera vez que la tarea transiciona a done. No hay rama
  // de limpieza: done es terminal (isStatusTransitionAllowed), por lo que una
  // transición done -> otro estado nunca llega a ejecutar este método.
  private stampCompletionIfNeeded(task: Task, next: TaskStatus): void {
    if (next === TaskStatus.DONE && task.status !== TaskStatus.DONE) {
      task.completedAt = new Date();
    }
  }

  // Una tarea done es un registro histórico cerrado: ningún campo salvo el
  // no-op de status (done -> done) puede modificarse. Lanza 400 si el dto
  // trae algún otro campo mientras la tarea ya está done.
  private assertTaskIsEditable(task: Task, dto: UpdateTaskDto): void {
    if (task.status !== TaskStatus.DONE) return;

    const hasNonStatusChanges =
      dto.title !== undefined ||
      dto.description !== undefined ||
      dto.priority !== undefined ||
      dto.dueDate !== undefined ||
      dto.estimatedHours !== undefined ||
      dto.projectId !== undefined ||
      dto.assigneeId !== undefined;

    if (hasNonStatusChanges) {
      throw new BadRequestException(
        'No se puede modificar una tarea completada. Crea una nueva tarea en su lugar.',
      );
    }
  }

  // Actualización parcial completa de una tarea (solo admin)
  async update(id: string, dto: UpdateTaskDto): Promise<TaskResponseDto> {
    const task = await this.tasksRepository.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');

    if (dto.status !== undefined) {
      this.assertStatusTransitionAllowed(task.status, dto.status);
    }
    this.assertTaskIsEditable(task, dto);

    if (dto.projectId !== undefined || dto.assigneeId !== undefined) {
      const effectiveProjectId = dto.projectId ?? task.projectId;
      const effectiveAssigneeId =
        dto.assigneeId !== undefined
          ? (dto.assigneeId ?? null)
          : task.assigneeId;
      await this.loadProjectAndAssertMembership(
        effectiveProjectId,
        effectiveAssigneeId,
      );
    }

    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined)
      task.description = dto.description ?? null;
    if (dto.status !== undefined && dto.status !== task.status) {
      // La tarea entra al final de su columna destino — nunca conserva el
      // `position` de la columna de origen (ver nextPositionInColumn).
      task.position = await this.nextPositionInColumn(
        dto.projectId ?? task.projectId,
        dto.status,
      );
      this.stampCompletionIfNeeded(task, dto.status);
      task.status = dto.status;
    }
    if (dto.priority !== undefined) task.priority = dto.priority;
    if (dto.dueDate !== undefined)
      task.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.estimatedHours !== undefined)
      task.estimatedHours = dto.estimatedHours ?? null;
    if (dto.projectId !== undefined) task.projectId = dto.projectId;
    if (dto.assigneeId !== undefined) task.assigneeId = dto.assigneeId ?? null;

    const saved = await this.tasksRepository.save(task);
    this.logger.info({ taskId: id }, 'Task updated');
    return TaskResponseDto.from(saved);
  }

  // Actualiza el status de una tarea; solo el asignado puede hacerlo y no puede poner CANCELLED
  async updateStatus(
    id: string,
    dto: UpdateStatusDto,
    currentUser: User,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksRepository.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');

    if (task.assigneeId !== currentUser.id) {
      throw new ForbiddenException('You are not the assignee of this task');
    }

    // dto.status está tipado como AllowedStatus (excluye CANCELLED) por
    // UpdateStatusDto, pero se revalida en runtime como defensa en profundidad.
    if ((dto.status as unknown as TaskStatus) === TaskStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot set status to cancelled via this endpoint',
      );
    }

    // El dev solo ve las canceladas en modo lectura: reabrirlas (cancelled -> *)
    // es una decisión del admin (vía updateTask), nunca de este endpoint.
    if (task.status === TaskStatus.CANCELLED) {
      throw new BadRequestException(
        'No se puede cambiar el estado de una tarea cancelada.',
      );
    }

    this.assertStatusTransitionAllowed(task.status, dto.status);

    const previousStatus = task.status;
    if (dto.status !== previousStatus) {
      // Entra al final de la columna destino (ver nextPositionInColumn) —
      // nunca conserva el `position` de la columna de origen.
      task.position = await this.nextPositionInColumn(
        task.projectId,
        dto.status,
      );
    }
    this.stampCompletionIfNeeded(task, dto.status);
    task.status = dto.status;
    const saved = await this.tasksRepository.save(task);
    this.logger.info(
      {
        taskId: id,
        from: previousStatus,
        to: dto.status,
        userId: currentUser.id,
      },
      'Task status changed',
    );
    return TaskResponseDto.from(saved);
  }

  // Actualiza la estimación de horas; solo el asignado puede hacerlo
  async updateEstimate(
    id: string,
    dto: UpdateEstimateDto,
    currentUser: User,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksRepository.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');

    if (task.assigneeId !== currentUser.id) {
      throw new ForbiddenException('You are not the assignee of this task');
    }

    if (
      task.status === TaskStatus.DONE ||
      task.status === TaskStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'No se puede modificar la estimación de una tarea completada o cancelada.',
      );
    }

    task.estimatedHours = dto.estimatedHours;
    const saved = await this.tasksRepository.save(task);
    return TaskResponseDto.from(saved);
  }

  // Soft-cancel: establece status = CANCELLED sin eliminar la fila (solo admin)
  async softCancel(id: string): Promise<TaskResponseDto> {
    const task = await this.tasksRepository.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');

    this.assertStatusTransitionAllowed(task.status, TaskStatus.CANCELLED);

    task.position = await this.nextPositionInColumn(
      task.projectId,
      TaskStatus.CANCELLED,
    );
    task.status = TaskStatus.CANCELLED;
    const saved = await this.tasksRepository.save(task);
    this.logger.info({ taskId: id }, 'Task cancelled');
    return TaskResponseDto.from(saved);
  }

  // Persiste el nuevo orden visual de una columna del kanban tras un
  // drag-and-drop dentro de la misma columna. `taskIds` debe ser exactamente
  // el mismo conjunto de IDs que ya existe en projectId+status (protección
  // contra datos obsoletos: si el board cambió entre el fetch y el drop, se
  // rechaza con 400 en vez de reordenar a ciegas). Cualquier miembro del
  // proyecto puede reordenar la columna compartida — es una decisión de
  // layout visual, no una edición de campos de la tarea de otro dev. Admin
  // también puede reordenar sin ser miembro (kanban admin es project-scoped).
  async reorderColumn(
    projectId: string,
    dto: ReorderColumnDto,
    currentUser: User,
  ): Promise<void> {
    await this.projectAccessService.assertCanRead(projectId, currentUser, {
      allowAdmin: true,
    });

    const existing = await this.tasksRepository.find({
      where: { projectId, status: dto.status },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((t) => t.id));
    const incomingIds = new Set(dto.taskIds);

    if (
      existingIds.size !== incomingIds.size ||
      dto.taskIds.some((id) => !existingIds.has(id))
    ) {
      throw new BadRequestException(
        'El tablero cambió desde que se cargó. Recargá la página e intentá de nuevo.',
      );
    }

    await Promise.all(
      dto.taskIds.map((id, index) =>
        this.tasksRepository.update(id, { position: index }),
      ),
    );
    this.logger.info(
      { projectId, status: dto.status, userId: currentUser.id },
      'Kanban column reordered',
    );
  }
}
