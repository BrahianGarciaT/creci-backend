import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Project } from '../projects/projects.entity';
import { ProjectAccessService } from '../projects/project-access.service';
import { User } from '../users/users.entity';
import { CreateTaskDto } from './dto/create-task.dto';
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
  ) {}

  // Crea una tarea; valida que el proyecto exista y opcionalmente carga el asignado
  async create(dto: CreateTaskDto, _adminUser: User): Promise<TaskResponseDto> {
    if (dto.assigneeId) {
      const assignee = await this.usersRepository.findOne({
        where: { id: dto.assigneeId },
      });
      if (!assignee) throw new NotFoundException('Assignee not found');
    }

    await this.loadProjectAndAssertMembership(dto.projectId, dto.assigneeId ?? null);

    const task = this.tasksRepository.create({
      title: dto.title,
      description: dto.description ?? null,
      priority: dto.priority,
      projectId: dto.projectId,
      assigneeId: dto.assigneeId ?? null,
      estimatedHours: dto.estimatedHours ?? null,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
    });

    const saved = await this.tasksRepository.save(task);
    return TaskResponseDto.from(saved);
  }

  // Devuelve todas las tareas (incluyendo canceladas); opcionalmente filtra por proyecto.
  // Orden explícito por createdAt: sin ORDER BY, Postgres no garantiza orden estable y
  // un UPDATE puede reubicar la fila (MVCC), haciendo que la tarea "salte" de posición
  // en el cliente justo al editarla.
  async findAll(projectId?: string): Promise<TaskResponseDto[]> {
    const where = projectId ? { projectId } : {};
    const tasks = await this.tasksRepository.find({
      where,
      relations: { project: true, assignee: true },
      order: { createdAt: 'ASC' },
    });
    return tasks.map(TaskResponseDto.from);
  }

  // Devuelve tareas no canceladas de un proyecto; verifica que el usuario sea miembro del proyecto
  async findByProject(projectId: string, currentUser: User): Promise<TaskResponseDto[]> {
    await this.projectAccessService.assertCanRead(projectId, currentUser, { allowAdmin: false });

    const tasks = await this.tasksRepository.find({
      where: {
        projectId,
        status: Not(TaskStatus.CANCELLED),
      },
      relations: { project: true, assignee: true },
      order: { createdAt: 'ASC' },
    });
    return tasks.map(TaskResponseDto.from);
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
  private assertStatusTransitionAllowed(current: TaskStatus, next: TaskStatus): void {
    if (!isStatusTransitionAllowed(current, next)) {
      throw new BadRequestException(
        'A completed task cannot change status. Create a new task instead.',
      );
    }
  }

  // Estampa completedAt la primera vez que la tarea transiciona a done. No hay rama
  // de limpieza: done es terminal (isStatusTransitionAllowed), por lo que una
  // transición done -> otro estado nunca llega a ejecutar este método.
  private stampCompletionIfNeeded(task: Task, next: TaskStatus): void {
    if (next === TaskStatus.DONE && task.status !== TaskStatus.DONE) {
      task.completedAt = new Date();
    }
  }

  // Actualización parcial completa de una tarea (solo admin)
  async update(id: string, dto: UpdateTaskDto): Promise<TaskResponseDto> {
    const task = await this.tasksRepository.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');

    if (dto.status !== undefined) {
      this.assertStatusTransitionAllowed(task.status, dto.status);
    }

    if (dto.projectId !== undefined || dto.assigneeId !== undefined) {
      const effectiveProjectId = dto.projectId ?? task.projectId;
      const effectiveAssigneeId =
        dto.assigneeId !== undefined ? (dto.assigneeId ?? null) : task.assigneeId;
      await this.loadProjectAndAssertMembership(effectiveProjectId, effectiveAssigneeId);
    }

    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description ?? null;
    if (dto.status !== undefined) {
      this.stampCompletionIfNeeded(task, dto.status);
      task.status = dto.status;
    }
    if (dto.priority !== undefined) task.priority = dto.priority;
    if (dto.dueDate !== undefined) task.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.estimatedHours !== undefined) task.estimatedHours = dto.estimatedHours ?? null;
    if (dto.projectId !== undefined) task.projectId = dto.projectId;
    if (dto.assigneeId !== undefined) task.assigneeId = dto.assigneeId ?? null;

    const saved = await this.tasksRepository.save(task);
    return TaskResponseDto.from(saved);
  }

  // Actualiza el status de una tarea; solo el asignado puede hacerlo y no puede poner CANCELLED
  async updateStatus(id: string, dto: UpdateStatusDto, currentUser: User): Promise<TaskResponseDto> {
    const task = await this.tasksRepository.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');

    if (task.assigneeId !== currentUser.id) {
      throw new ForbiddenException('You are not the assignee of this task');
    }

    if ((dto.status as string) === TaskStatus.CANCELLED) {
      throw new BadRequestException('Cannot set status to cancelled via this endpoint');
    }

    this.assertStatusTransitionAllowed(task.status, dto.status as TaskStatus);

    this.stampCompletionIfNeeded(task, dto.status as TaskStatus);
    task.status = dto.status as TaskStatus;
    const saved = await this.tasksRepository.save(task);
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

    task.estimatedHours = dto.estimatedHours;
    const saved = await this.tasksRepository.save(task);
    return TaskResponseDto.from(saved);
  }

  // Soft-cancel: establece status = CANCELLED sin eliminar la fila (solo admin)
  async softCancel(id: string): Promise<TaskResponseDto> {
    const task = await this.tasksRepository.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');

    this.assertStatusTransitionAllowed(task.status, TaskStatus.CANCELLED);

    task.status = TaskStatus.CANCELLED;
    const saved = await this.tasksRepository.save(task);
    return TaskResponseDto.from(saved);
  }
}
