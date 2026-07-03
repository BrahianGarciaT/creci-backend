import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { TaskPriority } from '../tasks.entity';

// DTO para crear una nueva tarea; projectId es requerido, los demás campos son opcionales
export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(TaskPriority)
  priority: TaskPriority;

  @IsUUID()
  projectId: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  estimatedHours?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
