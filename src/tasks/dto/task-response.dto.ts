import { Task, TaskPriority, TaskStatus } from '../tasks.entity';

interface ProjectSummary {
  id: string;
  name: string;
}

interface AssigneeSummary {
  id: string;
  email: string;
}

// DTO de respuesta para una tarea; incluye resumen de proyecto y asignado cuando están cargados
export class TaskResponseDto {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  // estimatedHours se coerciona a Number porque TypeORM devuelve string desde columna numeric
  estimatedHours: number | null;
  completedAt: Date | null;
  projectId: string;
  project: ProjectSummary | null;
  assigneeId: string | null;
  assignee: AssigneeSummary | null;
  createdAt: Date;
  updatedAt: Date;

  static from(task: Task): TaskResponseDto {
    const dto = new TaskResponseDto();
    dto.id = task.id;
    dto.title = task.title;
    dto.description = task.description ?? null;
    dto.status = task.status;
    dto.priority = task.priority;
    dto.dueDate = task.dueDate ?? null;
    dto.estimatedHours =
      task.estimatedHours != null ? Number(task.estimatedHours) : null;
    dto.completedAt = task.completedAt ?? null;
    dto.projectId = task.projectId;
    dto.project = task.project
      ? {
          id: task.project.id,
          name: task.project.name,
        }
      : null;
    dto.assigneeId = task.assigneeId ?? null;
    dto.assignee = task.assignee
      ? { id: task.assignee.id, email: task.assignee.email }
      : null;
    dto.createdAt = task.createdAt;
    dto.updatedAt = task.updatedAt;
    return dto;
  }
}
