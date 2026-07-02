import { Task, TaskPriority, TaskStatus } from '../tasks.entity';

// DTO de respuesta para una tarea; nunca expone relaciones completas de usuarios/proyectos
export class TaskResponseDto {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  // estimatedHours se coerciona a Number porque TypeORM devuelve string desde columna numeric
  estimatedHours: number | null;
  projectId: string;
  assigneeId: string | null;
  createdAt: Date;
  updatedAt: Date;

  // Mapper explícito desde la entidad Task
  static from(task: Task): TaskResponseDto {
    const dto = new TaskResponseDto();
    dto.id = task.id;
    dto.title = task.title;
    dto.description = task.description ?? null;
    dto.status = task.status;
    dto.priority = task.priority;
    dto.dueDate = task.dueDate ?? null;
    dto.estimatedHours = task.estimatedHours != null ? Number(task.estimatedHours) : null;
    dto.projectId = task.projectId;
    dto.assigneeId = task.assigneeId ?? null;
    dto.createdAt = task.createdAt;
    dto.updatedAt = task.updatedAt;
    return dto;
  }
}
