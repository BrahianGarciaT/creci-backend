import { UserResponseDto } from '../../users/dto/user-response.dto';
import { Project, ProjectStatus } from '../projects.entity';

// DTO de respuesta del proyecto; incluye el array de developers mapeados al DTO seguro
export class ProjectResponseDto {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  developers: UserResponseDto[];
  createdAt: Date;
  updatedAt: Date;

  // Mapper explícito desde la entidad. Nunca expone datos sensibles de los usuarios.
  static from(project: Project): ProjectResponseDto {
    const dto = new ProjectResponseDto();
    dto.id = project.id;
    dto.name = project.name;
    dto.description = project.description ?? null;
    dto.status = project.status;
    dto.developers = (project.developers ?? []).map((developer) =>
      UserResponseDto.from(developer),
    );
    dto.createdAt = project.createdAt;
    dto.updatedAt = project.updatedAt;
    return dto;
  }
}
