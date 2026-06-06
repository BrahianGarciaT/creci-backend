import { User, UserRole } from '../users.entity';

// DTO de respuesta seguro: nunca expone password ni refreshToken
export class UserResponseDto {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Mapper explícito desde la entidad. password y refreshToken nunca se copian.
  static from(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.role = user.role;
    dto.isActive = user.isActive;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
