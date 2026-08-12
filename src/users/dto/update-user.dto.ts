import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '../users.entity';

// DTO para la actualización parcial de un usuario. No incluye `email` (inmutable)
// ni `isActive` (gestionado por deactivate/reactivate). Hand-written en lugar de
// PartialType(CreateUserDto) porque este heredaría `email`, que debe quedar
// estructuralmente ausente.
export class UpdateUserDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  // Mínimo 8 caracteres; nunca se devuelve en la respuesta
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
