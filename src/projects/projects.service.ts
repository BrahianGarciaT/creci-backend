import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserRole } from '../users/users.entity';
import { User } from '../users/users.entity';
import { AssignDevelopersDto } from './dto/assign-developers.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project, ProjectStatus } from './projects.entity';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  // Devuelve todos los proyectos con sus developers asociados
  async findAll(): Promise<ProjectResponseDto[]> {
    const projects = await this.projectsRepository.find({
      relations: ['developers'],
    });
    return projects.map(ProjectResponseDto.from);
  }

  // Crea un nuevo proyecto con estado active por defecto
  async create(dto: CreateProjectDto): Promise<ProjectResponseDto> {
    const project = this.projectsRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      developers: [],
    });
    const saved = await this.projectsRepository.save(project);
    // Recarga con relaciones para consistencia en la respuesta
    const withRelations = await this.projectsRepository.findOne({
      where: { id: saved.id },
      relations: ['developers'],
    });
    return ProjectResponseDto.from(withRelations!);
  }

  // Actualiza name y/o description de un proyecto existente; lanza 404 si no existe
  async update(id: string, dto: UpdateProjectDto): Promise<ProjectResponseDto> {
    const project = await this.projectsRepository.findOne({
      where: { id },
      relations: ['developers'],
    });
    if (!project) throw new NotFoundException('Project not found');

    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description ?? null;
    if (dto.status !== undefined) project.status = dto.status;

    const saved = await this.projectsRepository.save(project);
    return ProjectResponseDto.from(saved);
  }

  // Desactiva un proyecto (soft-delete); lanza 400 si ya está inactivo
  async deactivate(id: string): Promise<ProjectResponseDto> {
    const project = await this.projectsRepository.findOne({
      where: { id },
      relations: ['developers'],
    });
    if (!project) throw new NotFoundException('Project not found');

    if (project.status === ProjectStatus.INACTIVE) {
      throw new BadRequestException('Project is already inactive');
    }

    project.status = ProjectStatus.INACTIVE;
    const saved = await this.projectsRepository.save(project);
    return ProjectResponseDto.from(saved);
  }

  // Reemplaza todos los developers del proyecto. Valida que cada id sea un usuario
  // activo con rol DEVELOPER; lanza 400 si alguno no cumple el criterio.
  async assignDevelopers(
    id: string,
    dto: AssignDevelopersDto,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsRepository.findOne({
      where: { id },
      relations: ['developers'],
    });
    if (!project) throw new NotFoundException('Project not found');

    if (dto.developerIds.length === 0) {
      project.developers = [];
      const saved = await this.projectsRepository.save(project);
      return ProjectResponseDto.from(saved);
    }

    // Busca los usuarios por los IDs provistos
    const users = await this.usersRepository.find({
      where: { id: In(dto.developerIds) },
    });

    // Detecta IDs inexistentes
    const foundIds = new Set(users.map((u) => u.id));
    const missingIds = dto.developerIds.filter((uid) => !foundIds.has(uid));
    if (missingIds.length > 0) {
      throw new BadRequestException(
        `Los siguientes IDs no existen: ${missingIds.join(', ')}`,
      );
    }

    // Detecta usuarios que no son developers activos
    const invalidUsers = users.filter(
      (u) => u.role !== UserRole.DEVELOPER || !u.isActive,
    );
    if (invalidUsers.length > 0) {
      const invalidIds = invalidUsers.map((u) => u.id);
      throw new BadRequestException(
        `Los siguientes usuarios no son developers activos: ${invalidIds.join(', ')}`,
      );
    }

    project.developers = users;
    const saved = await this.projectsRepository.save(project);

    // Recarga para incluir las relaciones completas en la respuesta
    const withRelations = await this.projectsRepository.findOne({
      where: { id: saved.id },
      relations: ['developers'],
    });
    return ProjectResponseDto.from(withRelations!);
  }
}
