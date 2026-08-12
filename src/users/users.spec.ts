import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { JwtStrategy } from '../auth/jwt.strategy';
import { Project, ProjectStatus } from '../projects/projects.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User, UserRole } from './users.entity';
import { UsersService } from './users.service';

// ── Helpers de fixture ─────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'uuid-1',
    email: 'dev@example.com',
    password: 'hashed',
    role: UserRole.DEVELOPER,
    isActive: true,
    refreshToken: null,
    projects: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  } as User;
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-uuid-1',
    name: 'Test Project',
    description: null,
    status: ProjectStatus.ACTIVE,
    developers: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  } as Project;
}

// ── Mock del EntityManager (transacción) ────────────────────────────────────────
// Encadenable: innerJoin/leftJoinAndSelect devuelven `this`, getMany resuelve el
// resultado configurado en cada test vía mockQueryBuilder.getMany.mockResolvedValue(...)

function makeQueryBuilder() {
  return {
    innerJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
}

let mockQueryBuilder = makeQueryBuilder();

const mockManager = {
  createQueryBuilder: jest.fn(() => mockQueryBuilder),
  save: jest.fn(),
  update: jest.fn(),
};

// ── Mock del repositorio ────────────────────────────────────────────────────────

const mockRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  manager: {
    transaction: jest.fn((cb: (manager: typeof mockManager) => unknown) => cb(mockManager)),
  },
};

// ── Suite principal ────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepository },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockQueryBuilder = makeQueryBuilder();
    mockManager.createQueryBuilder.mockImplementation(() => mockQueryBuilder);
  });

  // ── findByEmail ─────────────────────────────────────────────────────────────

  describe('findByEmail', () => {
    it('returns user when found', async () => {
      const user = makeUser();
      mockRepository.findOne.mockResolvedValue(user);
      const result = await service.findByEmail('dev@example.com');
      expect(result).toEqual(user);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { email: 'dev@example.com' } });
    });

    it('returns null when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      expect(await service.findByEmail('nope@example.com')).toBeNull();
    });
  });

  // ── findById ────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns user when found', async () => {
      const user = makeUser();
      mockRepository.findOne.mockResolvedValue(user);
      const result = await service.findById('uuid-1');
      expect(result).toEqual(user);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 'uuid-1' } });
    });

    it('returns null when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      expect(await service.findById('nonexistent')).toBeNull();
    });
  });

  // ── updateRefreshToken ──────────────────────────────────────────────────────

  describe('updateRefreshToken', () => {
    it('calls update with the given values', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 });
      await service.updateRefreshToken('uuid-1', 'hashed-token');
      expect(mockRepository.update).toHaveBeenCalledWith('uuid-1', { refreshToken: 'hashed-token' });
    });

    it('clears the token when null is passed', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 });
      await service.updateRefreshToken('uuid-1', null);
      expect(mockRepository.update).toHaveBeenCalledWith('uuid-1', { refreshToken: null });
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateUserDto = {
      email: 'new@example.com',
      password: 'secret99',
      role: UserRole.DEVELOPER,
    };

    it('happy path: returns UserResponseDto without password', async () => {
      // No hay usuario existente con ese email
      mockRepository.findOne.mockResolvedValue(null);
      const savedUser = makeUser({ id: 'uuid-new', email: dto.email, role: UserRole.DEVELOPER });
      mockRepository.create.mockReturnValue(savedUser);
      mockRepository.save.mockResolvedValue(savedUser);

      const result = await service.create(dto);

      expect(result).toBeInstanceOf(UserResponseDto);
      expect(result.email).toBe(dto.email);
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('verifica que el password almacenado es un hash bcrypt', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      let capturedPassword = '';
      mockRepository.create.mockImplementation((data: Partial<User>) => {
        capturedPassword = data.password ?? '';
        return makeUser({ email: dto.email, password: capturedPassword });
      });
      mockRepository.save.mockImplementation((u: User) => Promise.resolve(u));

      await service.create(dto);

      // El password almacenado debe ser un hash bcrypt (comienza con $2b$)
      expect(capturedPassword).toMatch(/^\$2[ab]\$/);
      const isMatch = await bcrypt.compare(dto.password, capturedPassword);
      expect(isMatch).toBe(true);
    });

    it('lanza ConflictException (409) si el email ya existe', async () => {
      mockRepository.findOne.mockResolvedValue(makeUser({ email: dto.email }));

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('devuelve un array de UserResponseDto sin password ni refreshToken', async () => {
      const users = [
        makeUser({ id: 'uuid-1', email: 'a@example.com' }),
        makeUser({ id: 'uuid-2', email: 'b@example.com', role: UserRole.ADMIN }),
      ];
      mockRepository.find.mockResolvedValue(users);

      const result = await service.findAll();

      expect(mockRepository.find).toHaveBeenCalledWith({
        relations: { projects: true },
        order: { createdAt: 'ASC' },
      });
      expect(result).toHaveLength(2);
      result.forEach((dto) => {
        expect(dto).toBeInstanceOf(UserResponseDto);
        expect(dto).not.toHaveProperty('password');
        expect(dto).not.toHaveProperty('refreshToken');
      });
    });

    it('devuelve array vacío cuando no hay usuarios', async () => {
      mockRepository.find.mockResolvedValue([]);
      const result = await service.findAll();
      expect(result).toEqual([]);
    });
  });

  // ── deactivate ──────────────────────────────────────────────────────────────

  describe('deactivate', () => {
    const adminActor = makeUser({ id: 'actor-uuid', role: UserRole.ADMIN });

    it('lanza NotFoundException (404) si el id no existe', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.deactivate('nonexistent', adminActor)).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException (403) si el target tiene role ADMIN', async () => {
      const targetAdmin = makeUser({ id: 'other-admin', role: UserRole.ADMIN });
      mockRepository.findOne.mockResolvedValue(targetAdmin);

      await expect(service.deactivate('other-admin', adminActor)).rejects.toThrow(ForbiddenException);
    });

    it('es idempotente: devuelve 200 si el usuario ya estaba inactivo', async () => {
      const alreadyInactive = makeUser({ id: 'uuid-1', isActive: false });
      mockRepository.findOne.mockResolvedValue(alreadyInactive);

      const result = await service.deactivate('uuid-1', adminActor);

      // No debe llamar a update si ya estaba inactivo
      expect(mockRepository.update).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(UserResponseDto);
      expect(result.isActive).toBe(false);
    });

    it('desactiva el usuario y devuelve UserResponseDto con isActive false', async () => {
      const activeUser = makeUser({ id: 'uuid-1', isActive: true });
      const reloaded = makeUser({ id: 'uuid-1', isActive: false, projects: [] });
      mockRepository.findOne.mockResolvedValueOnce(activeUser).mockResolvedValueOnce(reloaded);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.deactivate('uuid-1', adminActor);

      expect(mockRepository.manager.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.update).toHaveBeenCalledWith(User, 'uuid-1', { isActive: false });
      expect(mockRepository.findOne).toHaveBeenLastCalledWith({
        where: { id: 'uuid-1' },
        relations: { projects: true },
      });
      expect(result).toBeInstanceOf(UserResponseDto);
      expect(result.isActive).toBe(false);
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('usa el join de dos alias (target para filtrar, developer para cargar la lista completa)', async () => {
      const activeUser = makeUser({ id: 'uuid-1', isActive: true });
      const reloaded = makeUser({ id: 'uuid-1', isActive: false });
      mockRepository.findOne.mockResolvedValueOnce(activeUser).mockResolvedValueOnce(reloaded);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.deactivate('uuid-1', adminActor);

      expect(mockManager.createQueryBuilder).toHaveBeenCalledWith(Project, 'project');
      expect(mockQueryBuilder.innerJoin).toHaveBeenCalledWith(
        'project.developers',
        'target',
        'target.id = :userId',
        { userId: 'uuid-1' },
      );
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('project.developers', 'developer');
    });

    it('trampa del join destructivo: un developer co-asignado en el mismo proyecto sobrevive a la cascada', async () => {
      const target = makeUser({ id: 'uuid-1', isActive: true });
      const coAssigned = makeUser({ id: 'uuid-2', email: 'other@example.com' });
      const project = makeProject({
        id: 'proj-1',
        developers: [target, coAssigned],
      });
      const reloaded = makeUser({ id: 'uuid-1', isActive: false });

      mockRepository.findOne.mockResolvedValueOnce(target).mockResolvedValueOnce(reloaded);
      mockQueryBuilder.getMany.mockResolvedValue([project]);
      mockManager.save.mockResolvedValue([project]);

      await service.deactivate('uuid-1', adminActor);

      expect(mockManager.save).toHaveBeenCalledTimes(1);
      const savedProjects = mockManager.save.mock.calls[0][0] as { developers: User[] }[];
      expect(savedProjects).toHaveLength(1);
      // El co-developer debe seguir presente; solo el usuario objetivo se remueve
      expect(savedProjects[0].developers.map((d) => d.id)).toEqual(['uuid-2']);
    });

    it('no persiste (no llama a manager.save) si el usuario no tiene proyectos asignados', async () => {
      const activeUser = makeUser({ id: 'uuid-1', isActive: true });
      const reloaded = makeUser({ id: 'uuid-1', isActive: false });
      mockRepository.findOne.mockResolvedValueOnce(activeUser).mockResolvedValueOnce(reloaded);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.deactivate('uuid-1', adminActor);

      expect(mockManager.save).not.toHaveBeenCalled();
    });
  });

  // ── reactivate ──────────────────────────────────────────────────────────────

  describe('reactivate', () => {
    it('lanza NotFoundException (404) si el id no existe', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.reactivate('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException (400) si el usuario ya está activo', async () => {
      const activeUser = makeUser({ id: 'uuid-1', isActive: true });
      mockRepository.findOne.mockResolvedValue(activeUser);

      await expect(service.reactivate('uuid-1')).rejects.toThrow(BadRequestException);
    });

    it('reactiva el usuario y no restaura las asignaciones de proyecto removidas', async () => {
      const inactiveUser = makeUser({ id: 'uuid-1', isActive: false, projects: [] });
      const reloaded = makeUser({ id: 'uuid-1', isActive: true, projects: [] });
      mockRepository.findOne.mockResolvedValueOnce(inactiveUser).mockResolvedValueOnce(reloaded);
      mockRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.reactivate('uuid-1');

      expect(mockRepository.update).toHaveBeenCalledWith('uuid-1', { isActive: true });
      expect(result.isActive).toBe(true);
      expect(result.projects).toEqual([]);
    });
  });
});

// ── JwtStrategy.validate ────────────────────────────────────────────────────────

describe('JwtStrategy.validate', () => {
  let strategy: JwtStrategy;
  const mockUsersService = { findById: jest.fn() };

  // ConfigService mínimo para satisfacer el constructor de PassportStrategy
  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('test-secret'),
  };

  beforeEach(() => {
    // Instanciamos directamente para evitar depender de ConfigService en DI
    strategy = new JwtStrategy(mockConfigService as any, mockUsersService as any);
  });

  afterEach(() => jest.clearAllMocks());

  it('lanza UnauthorizedException cuando user.isActive === false', async () => {
    const inactiveUser = makeUser({ isActive: false });
    mockUsersService.findById.mockResolvedValue(inactiveUser);

    await expect(
      strategy.validate({ sub: 'uuid-1', email: 'dev@example.com', role: UserRole.DEVELOPER }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException cuando el usuario no existe', async () => {
    mockUsersService.findById.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'nonexistent', email: 'x@x.com', role: UserRole.DEVELOPER }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('devuelve el usuario cuando está activo', async () => {
    const activeUser = makeUser({ isActive: true });
    mockUsersService.findById.mockResolvedValue(activeUser);

    const result = await strategy.validate({ sub: 'uuid-1', email: 'dev@example.com', role: UserRole.DEVELOPER });
    expect(result).toEqual(activeUser);
  });
});
