import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { clearAssigneeForRemovedDevelopers } from '../tasks/tasks-assignee-cascade';
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

  // Devuelve los proyectos donde el usuario autenticado es developer.
  // Orden explícito por createdAt: sin ORDER BY, Postgres no garantiza orden
  // estable y un UPDATE puede reubicar la fila (MVCC) — mismo bug ya
  // corregido en tasks.service.ts.
  async findMine(userId: string): Promise<ProjectResponseDto[]> {
    const projects = await this.projectsRepository
      .createQueryBuilder('project')
      .innerJoin('project.developers', 'dev', 'dev.id = :userId', { userId })
      .leftJoinAndSelect('project.developers', 'developer')
      .where('project.status = :status', { status: ProjectStatus.ACTIVE })
      .orderBy('project.createdAt', 'ASC')
      .getMany();
    return projects.map(ProjectResponseDto.from);
  }

  // Devuelve todos los proyectos con sus developers asociados
  async findAll(): Promise<ProjectResponseDto[]> {
    const projects = await this.projectsRepository.find({
      relations: { developers: true },
      order: { createdAt: 'ASC' },
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
      relations: { developers: true },
    });
    return ProjectResponseDto.from(withRelations!);
  }

  // Actualiza name y/o description de un proyecto existente; lanza 404 si no existe
  async update(id: string, dto: UpdateProjectDto): Promise<ProjectResponseDto> {
    const project = await this.projectsRepository.findOne({
      where: { id },
      relations: { developers: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description ?? null;

    const saved = await this.projectsRepository.save(project);
    return ProjectResponseDto.from(saved);
  }

  // Desactiva un proyecto (soft-delete); lanza 400 si ya está inactivo
  async deactivate(id: string): Promise<ProjectResponseDto> {
    const project = await this.projectsRepository.findOne({
      where: { id },
      relations: { developers: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    if (project.status === ProjectStatus.INACTIVE) {
      throw new BadRequestException('Project is already inactive');
    }

    project.status = ProjectStatus.INACTIVE;
    const saved = await this.projectsRepository.save(project);
    return ProjectResponseDto.from(saved);
  }

  // Reactiva un proyecto (revierte soft-delete); lanza 400 si ya está activo
  async reactivate(id: string): Promise<ProjectResponseDto> {
    const project = await this.projectsRepository.findOne({
      where: { id },
      relations: { developers: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.status === ProjectStatus.ACTIVE) {
      throw new BadRequestException('Project is already active');
    }
    project.status = ProjectStatus.ACTIVE;
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
      relations: { developers: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const previousDeveloperIds = project.developers.map((d) => d.id);
    let newDevelopers: User[];

    if (dto.developerIds.length === 0) {
      newDevelopers = [];
    } else {
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

      newDevelopers = users;
    }

    // IDs removidos de la lista de developers: sus tareas no-done en este
    // proyecto deben perder el assigneeId, atómicamente con el cambio de membresía.
    const newDeveloperIds = new Set(newDevelopers.map((u) => u.id));
    const removedIds = previousDeveloperIds.filter((uid) => !newDeveloperIds.has(uid));

    await this.projectsRepository.manager.transaction(async (manager) => {
      project.developers = newDevelopers;
      await manager.save(project);
      await clearAssigneeForRemovedDevelopers(manager, [id], removedIds);
    });

    // Recarga para incluir las relaciones completas en la respuesta
    const withRelations = await this.projectsRepository.findOne({
      where: { id },
      relations: { developers: true },
    });
    return ProjectResponseDto.from(withRelations!);
  }
}
