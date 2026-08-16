import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { PinoLogger } from 'nestjs-pino';
import { EntityManager, Repository } from 'typeorm';
import { Project } from '../projects/projects.entity';
import { clearAssigneeForRemovedDevelopers } from '../tasks/tasks-assignee-cascade';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User, UserRole } from './users.entity';

// Número de rondas de sal para bcrypt; mismo valor que en auth.service.ts
const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersService.name);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async updateRefreshToken(
    id: string,
    refreshToken: string | null,
  ): Promise<void> {
    await this.usersRepository.update(id, { refreshToken });
  }

  // Crea un nuevo usuario. Lanza 409 si el email ya existe y 400 si el DTO es inválido.
  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    const password = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = this.usersRepository.create({
      email: dto.email,
      password,
      role: dto.role,
    });

    try {
      const saved = await this.usersRepository.save(user);
      this.logger.info({ userId: saved.id, role: saved.role }, 'User created');
      return UserResponseDto.from(saved);
    } catch (error: unknown) {
      // Violación de restricción unique de Postgres (defensa en profundidad)
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }
  }

  // Devuelve todos los usuarios mapeados al DTO seguro (sin password ni refreshToken).
  // Orden explícito por createdAt: sin ORDER BY, Postgres no garantiza orden
  // estable y un UPDATE (ej. deactivate/reactivate) puede reubicar la fila
  // (MVCC) — mismo bug ya corregido en tasks.service.ts.
  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.usersRepository.find({
      relations: { projects: true },
      order: { createdAt: 'ASC' },
    });
    return users.map((user) => UserResponseDto.from(user));
  }

  // Elimina al usuario de la lista `developers` de todos los proyectos donde
  // esté asignado. Mutamos Project.developers (lado dueño de la relación) —
  // nunca user.projects (lado inverso, asignarlo sería un no-op silencioso).
  //
  // Trampa evitada: un `find({ where: { developers: { id } }, relations: { developers: true } })`
  // reutilizaría el mismo alias de join para filtrar Y para cargar `developers`,
  // por lo que la lista cargada contendría solo el usuario buscado — al hacer
  // `save` se borrarían todos los demás developers del proyecto. Usamos dos
  // alias separados (mismo patrón que ProjectsService.findMine()): uno para
  // filtrar (`target`) y otro para cargar la lista completa (`developer`).
  // Devuelve los IDs de los proyectos afectados (ya cargados aquí) para que el
  // caller pueda encadenar clearAssigneeForRemovedDevelopers() en la misma transacción.
  private async removeAllProjectAssignments(
    manager: EntityManager,
    userId: string,
  ): Promise<string[]> {
    const projects = await manager
      .createQueryBuilder(Project, 'project')
      .innerJoin('project.developers', 'target', 'target.id = :userId', {
        userId,
      })
      .leftJoinAndSelect('project.developers', 'developer')
      .getMany();

    if (projects.length === 0) return [];

    for (const project of projects) {
      project.developers = project.developers.filter((d) => d.id !== userId);
    }

    await manager.save(projects);
    return projects.map((p) => p.id);
  }

  // Desactiva (soft-delete) un usuario. Idempotente: si ya estaba inactivo devuelve 200.
  // Además de is_active=false, remueve al usuario de todas las asignaciones de
  // proyecto en la misma transacción (cascada).
  async deactivate(id: string, actor: User): Promise<UserResponseDto> {
    const target = await this.findById(id);
    if (!target) throw new NotFoundException('User not found');

    // Un admin no puede desactivarse a sí mismo
    if (target.id === actor.id) {
      throw new ForbiddenException('Cannot deactivate your own account');
    }

    // Solo se pueden desactivar cuentas con rol DEVELOPER
    if (target.role === UserRole.ADMIN) {
      throw new ForbiddenException('Admin accounts cannot be deactivated');
    }

    // Idempotente: si ya está inactivo se devuelve el DTO sin error
    if (!target.isActive) {
      return UserResponseDto.from(target);
    }

    await this.usersRepository.manager.transaction(async (manager) => {
      const affectedProjectIds = await this.removeAllProjectAssignments(
        manager,
        id,
      );
      await clearAssigneeForRemovedDevelopers(manager, affectedProjectIds, [
        id,
      ]);
      await manager.update(User, id, { isActive: false });
    });

    this.logger.info({ userId: id, actorId: actor.id }, 'User deactivated');

    const updated = await this.usersRepository.findOne({
      where: { id },
      relations: { projects: true },
    });
    return UserResponseDto.from(updated!);
  }

  // Actualiza role y/o password. `email` e `isActive` no son parte de UpdateUserDto,
  // por lo que nunca se modifican aquí. Si el role cambia hacia afuera de DEVELOPER,
  // remueve las asignaciones de proyecto (mismo helper/transacción que deactivate()).
  // Si se envía password, se rehashea y refreshToken se pone en null (invalida
  // sesión) — solo cuando password fue efectivamente enviado.
  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const target = await this.findById(id);
    if (!target) throw new NotFoundException('User not found');

    await this.usersRepository.manager.transaction(async (manager) => {
      const changes: Partial<User> = {};

      if (dto.role !== undefined) {
        changes.role = dto.role;
        if (dto.role !== UserRole.DEVELOPER) {
          const affectedProjectIds = await this.removeAllProjectAssignments(
            manager,
            id,
          );
          await clearAssigneeForRemovedDevelopers(manager, affectedProjectIds, [
            id,
          ]);
        }
      }

      if (dto.password !== undefined) {
        changes.password = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
        changes.refreshToken = null;
      }

      if (Object.keys(changes).length > 0) {
        await manager.update(User, id, changes);
      }

      if (dto.role !== undefined) {
        this.logger.info({ userId: id, role: dto.role }, 'User role changed');
      }
      if (dto.password !== undefined) {
        this.logger.info({ userId: id }, 'User password reset');
      }
    });

    const updated = await this.usersRepository.findOne({
      where: { id },
      relations: { projects: true },
    });
    return UserResponseDto.from(updated!);
  }

  // Reactiva un usuario previamente desactivado; lanza 400 si ya está activo.
  // No restaura asignaciones de proyecto removidas por deactivate() — el admin
  // debe reasignarlas manualmente.
  async reactivate(id: string): Promise<UserResponseDto> {
    const target = await this.findById(id);
    if (!target) throw new NotFoundException('User not found');
    if (target.isActive) {
      throw new BadRequestException('User is already active');
    }
    await this.usersRepository.update(id, { isActive: true });
    this.logger.info({ userId: id }, 'User reactivated');

    const updated = await this.usersRepository.findOne({
      where: { id },
      relations: { projects: true },
    });
    return UserResponseDto.from(updated!);
  }
}
