import { IsEnum, IsOptional } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { CreateProjectDto } from './create-project.dto';
import { ProjectStatus } from '../projects.entity';

// DTO para la actualización parcial de un proyecto; todos los campos son opcionales
export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  // Permite cambiar el estado explícitamente (p. ej. desde deactivate)
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
