import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Project } from '../projects/projects.entity';
import { User } from '../users/users.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { UpdateEstimateDto } from './dto/update-estimate.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task, TaskStatus } from './tasks.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  // Crea una tarea; valida que el proyecto exista y opcionalmente carga el asignado
  async create(dto: CreateTaskDto, _adminUser: User): Promise<TaskResponseDto> {
    const project = await this.projectsRepository.findOne({
      where: { id: dto.projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    if (dto.assigneeId) {
      const assignee = await this.usersRepository.findOne({
        where: { id: dto.assigneeId },
      });
      if (!assignee) throw new NotFoundException('Assignee not found');
    }

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

  // Devuelve todas las tareas (incluyendo canceladas); opcionalmente filtra por proyecto
  async findAll(projectId?: string): Promise<TaskResponseDto[]> {
    const where = projectId ? { projectId } : {};
    const tasks = await this.tasksRepository.find({
      where,
      relations: { project: true, assignee: true },
    });
    return tasks.map(TaskResponseDto.from);
  }

  // Devuelve tareas no canceladas de un proyecto; verifica que el usuario sea miembro del proyecto
  async findByProject(projectId: string, currentUser: User): Promise<TaskResponseDto[]> {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
      relations: { developers: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const isMember = project.developers.some((dev) => dev.id === currentUser.id);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this project');
    }

    const tasks = await this.tasksRepository.find({
      where: {
        projectId,
        status: Not(TaskStatus.CANCELLED),
      },
      relations: { project: true, assignee: true },
    });
    return tasks.map(TaskResponseDto.from);
  }

  // Actualización parcial completa de una tarea (solo admin)
  async update(id: string, dto: UpdateTaskDto): Promise<TaskResponseDto> {
    const task = await this.tasksRepository.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');

    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description ?? null;
    if (dto.status !== undefined) task.status = dto.status;
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

    task.status = TaskStatus.CANCELLED;
    const saved = await this.tasksRepository.save(task);
    return TaskResponseDto.from(saved);
  }
}
