import { IsArray, IsUUID } from 'class-validator';

// DTO para la asignación (replace-all) de developers a un proyecto
export class AssignDevelopersDto {
  // Lista de IDs de usuarios con rol developer; puede ser vacía para limpiar asignaciones
  @IsArray()
  @IsUUID('all', { each: true })
  developerIds: string[];
}
