import { PartialType } from '@nestjs/swagger';
import { IsDate, IsEnum, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus } from '../tasks.entity';
import { CreateTaskDto } from './create-task.dto';

// DTO para la actualización parcial de una tarea por parte del admin
// Extiende CreateTaskDto con PartialType (todos los campos opcionales) y agrega status y dueDate
export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;
}
