import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '../auth/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User, UserRole } from './users.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// ── Helpers de fixture ─────────────────────────────────────────────────────────

function makeResponseDto(overrides: Partial<UserResponseDto> = {}): UserResponseDto {
  const dto = new UserResponseDto();
  dto.id = 'uuid-1';
  dto.email = 'dev@example.com';
  dto.role = UserRole.DEVELOPER;
  dto.isActive = true;
  dto.createdAt = new Date('2024-01-01');
  dto.updatedAt = new Date('2024-01-01');
  return Object.assign(dto, overrides);
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'actor-uuid',
    email: 'admin@example.com',
    password: 'hashed',
    role: UserRole.ADMIN,
    isActive: true,
    refreshToken: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  } as User;
}

// ── Mock del servicio ───────────────────────────────────────────────────────────

const mockUsersService = {
  create: jest.fn(),
  findAll: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
};

// ── Suite principal ────────────────────────────────────────────────────────────

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        // Reemplaza RolesGuard para probar el controlador en aislamiento
        { provide: RolesGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(UsersController);
  });

  afterEach(() => jest.clearAllMocks());

  // ── POST /users ─────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateUserDto = {
      email: 'new@example.com',
      password: 'secret99',
      role: UserRole.DEVELOPER,
    };

    it('llama a UsersService.create con el DTO recibido (ADMIN alcanza el endpoint)', async () => {
      const responseDto = makeResponseDto({ email: dto.email });
      mockUsersService.create.mockResolvedValue(responseDto);

      const result = await controller.create(dto);

      expect(mockUsersService.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(responseDto);
    });

    it('la respuesta no contiene password ni refreshToken', async () => {
      const responseDto = makeResponseDto({ email: dto.email });
      mockUsersService.create.mockResolvedValue(responseDto);

      const result = await controller.create(dto);

      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('refreshToken');
    });
  });

  // ── GET /users ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('llama a UsersService.findAll y devuelve el array (ADMIN alcanza el endpoint)', async () => {
      const dtos = [
        makeResponseDto({ id: 'uuid-1', email: 'a@example.com' }),
        makeResponseDto({ id: 'uuid-2', email: 'b@example.com' }),
      ];
      mockUsersService.findAll.mockResolvedValue(dtos);

      const result = await controller.findAll();

      expect(mockUsersService.findAll).toHaveBeenCalledTimes(1);
      expect(result).toBe(dtos);
    });

    it('ningún elemento de la respuesta contiene password ni refreshToken', async () => {
      const dtos = [
        makeResponseDto({ id: 'uuid-1' }),
        makeResponseDto({ id: 'uuid-2' }),
      ];
      mockUsersService.findAll.mockResolvedValue(dtos);

      const result = await controller.findAll();

      result.forEach((dto) => {
        expect(dto).not.toHaveProperty('password');
        expect(dto).not.toHaveProperty('refreshToken');
      });
    });
  });

  // ── PATCH /users/:id ────────────────────────────────────────────────────────

  describe('update', () => {
    it('llama a UsersService.update con id y dto (ADMIN alcanza el endpoint)', async () => {
      const dto: UpdateUserDto = { role: UserRole.ADMIN };
      const responseDto = makeResponseDto({ role: UserRole.ADMIN });
      mockUsersService.update.mockResolvedValue(responseDto);

      const result = await controller.update('uuid-1', dto);

      expect(mockUsersService.update).toHaveBeenCalledWith('uuid-1', dto);
      expect(result).toBe(responseDto);
    });

    it('propaga NotFoundException (404) cuando el id no existe', async () => {
      mockUsersService.update.mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.update('nonexistent', {})).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /users/:id/deactivate ─────────────────────────────────────────────

  describe('deactivate', () => {
    const actor = makeUser();

    it('llama a UsersService.deactivate con id y actor (ADMIN alcanza el endpoint)', async () => {
      const responseDto = makeResponseDto({ isActive: false });
      mockUsersService.deactivate.mockResolvedValue(responseDto);

      const result = await controller.deactivate('uuid-1', actor);

      expect(mockUsersService.deactivate).toHaveBeenCalledWith('uuid-1', actor);
      expect(result).toBe(responseDto);
    });

    it('la respuesta de deactivate no contiene password ni refreshToken', async () => {
      const responseDto = makeResponseDto({ isActive: false });
      mockUsersService.deactivate.mockResolvedValue(responseDto);

      const result = await controller.deactivate('uuid-1', actor);

      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('propaga ForbiddenException (403) cuando el target es ADMIN', async () => {
      mockUsersService.deactivate.mockRejectedValue(
        new ForbiddenException('Admin accounts cannot be deactivated'),
      );

      await expect(controller.deactivate('admin-uuid', actor)).rejects.toThrow(ForbiddenException);
    });

    it('propaga NotFoundException (404) cuando el id no existe', async () => {
      mockUsersService.deactivate.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(controller.deactivate('nonexistent', actor)).rejects.toThrow(NotFoundException);
    });
  });
});
