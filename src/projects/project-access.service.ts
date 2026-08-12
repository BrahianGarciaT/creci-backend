import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/users.entity';
import { Project } from './projects.entity';

// Centraliza la verificación de acceso de lectura a un proyecto: el usuario debe
// ser miembro (developer) del proyecto, o admin cuando allowAdmin es true.
// Extraído del chequeo inline que existía en TasksService.findByProject.
@Injectable()
export class ProjectAccessService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
  ) {}

  async assertCanRead(
    projectId: string,
    user: User,
    { allowAdmin }: { allowAdmin: boolean },
  ): Promise<void> {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
      relations: { developers: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    if (allowAdmin && user.role === UserRole.ADMIN) {
      return;
    }

    const isMember = project.developers.some((dev) => dev.id === user.id);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this project');
    }
  }
}
