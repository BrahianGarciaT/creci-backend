import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// DTO para la creación de un nuevo proyecto
export class CreateProjectDto {
  // Nombre del proyecto; requerido y no vacío
  @IsString()
  @IsNotEmpty()
  name: string;

  // Descripción opcional del proyecto
  @IsOptional()
  @IsString()
  description?: string;
}
