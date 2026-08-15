import { User, UserRole } from '../users.entity';

// DTO de respuesta seguro: nunca expone password ni refreshToken
export class UserResponseDto {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  projects: { id: string; name: string }[];
  createdAt: Date;
  updatedAt: Date;

  // Mapper explícito desde la entidad. password y refreshToken nunca se copian.
  static from(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.role = user.role;
    dto.isActive = user.isActive;
    dto.projects =
      user.projects?.map((p) => ({ id: p.id, name: p.name })) ?? [];
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
