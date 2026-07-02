import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User, UserRole } from './users.entity';

// Número de rondas de sal para bcrypt; mismo valor que en auth.service.ts
const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async updateRefreshToken(id: string, refreshToken: string | null): Promise<void> {
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
      return UserResponseDto.from(saved);
    } catch (error: unknown) {
      // Violación de restricción unique de Postgres (defensa en profundidad)
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }
  }

  // Devuelve todos los usuarios mapeados al DTO seguro (sin password ni refreshToken)
  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.usersRepository.find();
    return users.map(UserResponseDto.from);
  }

  // Desactiva (soft-delete) un usuario. Idempotente: si ya estaba inactivo devuelve 200.
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

    await this.usersRepository.update(id, { isActive: false });
    return UserResponseDto.from({ ...target, isActive: false });
  }

  // Reactiva un usuario previamente desactivado; lanza 400 si ya está activo
  async reactivate(id: string): Promise<UserResponseDto> {
    const target = await this.findById(id);
    if (!target) throw new NotFoundException('User not found');
    if (target.isActive) {
      throw new BadRequestException('User is already active');
    }
    await this.usersRepository.update(id, { isActive: true });
    return UserResponseDto.from({ ...target, isActive: true });
  }
}
