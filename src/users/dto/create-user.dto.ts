import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '../users.entity';

// DTO para la creación de un nuevo usuario
export class CreateUserDto {
  @IsEmail()
  email: string;

  // Mínimo 8 caracteres; nunca se devuelve en la respuesta
  @IsString()
  @MinLength(8)
  password: string;

  // Opcional: si no se envía, la entidad asigna DEVELOPER por defecto
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
