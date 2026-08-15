import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, Not } from 'typeorm';
import { Task, TaskStatus } from '../tasks/tasks.entity';
import { User, UserRole } from '../users/users.entity';
import { AssignDevelopersDto } from './dto/assign-developers.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project, ProjectStatus } from './projects.entity';
import { ProjectsService } from './projects.service';

// ── Helpers de fixture ─────────────────────────────────────────────────────────

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-uuid-1',
    name: 'Test Project',
    description: 'A description',
    status: ProjectStatus.ACTIVE,
    developers: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-uuid-1',
    email: 'dev@example.com',
    password: 'hashed',
    role: UserRole.DEVELOPER,
    isActive: true,
    refreshToken: null,
    projects: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ── Mocks de repositorios ───────────────────────────────────────────────────────

const mockManager = {
  save: jest.fn(),
  update: jest.fn(),
};

const mockProjectsRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  createQueryBuilder: jest.fn(),
  manager: {
    transaction: jest.fn((cb: (manager: typeof mockManager) => unknown) =>
      cb(mockManager),
    ),
  },
};

const mockUsersRepository = {
  find: jest.fn(),
};

// QB mock chainable auto-referente; usado por findMine (join a-muchos, requiere
// getManyAndCount para paginar entidades, no filas crudas). No hay precedente
// de este patrón en el repo — se colocaliza aquí per diseño.
type MockQueryBuilder = Record<
  'innerJoin' | 'leftJoinAndSelect' | 'where' | 'orderBy' | 'skip' | 'take',
  jest.Mock
> & { getManyAndCount: jest.Mock };

function makeQueryBuilderMock(result: [Project[], number]): MockQueryBuilder {
  const qb = {} as MockQueryBuilder;
  const chainableMethods = [
    'innerJoin',
    'leftJoinAndSelect',
    'where',
    'orderBy',
    'skip',
    'take',
  ] as const;
  for (const method of chainableMethods) {
    qb[method] = jest.fn(() => qb);
  }
  qb.getManyAndCount = jest.fn().mockResolvedValue(result);
  return qb;
}

// ── Suite principal ────────────────────────────────────────────────────────────

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectsRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUsersRepository,
        },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('devuelve la lista paginada de proyectos mapeados a ProjectResponseDto', async () => {
      const projects = [
        makeProject(),
        makeProject({ id: 'proj-uuid-2', name: 'Another' }),
      ];
      mockProjectsRepository.findAndCount.mockResolvedValue([projects, 2]);

      const result = await service.findAll({});

      expect(mockProjectsRepository.findAndCount).toHaveBeenCalledWith({
        relations: { developers: true },
        order: { createdAt: 'ASC' },
        skip: 0,
        take: 20,
      });
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('proj-uuid-1');
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('devuelve data vacía cuando no hay proyectos', async () => {
      mockProjectsRepository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll({});

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('aplica skip/take derivados de page/limit provistos', async () => {
      mockProjectsRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ page: 2, limit: 10 });

      expect(mockProjectsRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('data:[] con meta.total preciso cuando page excede totalPages (sin clamping)', async () => {
      mockProjectsRepository.findAndCount.mockResolvedValue([[], 3]);

      const result = await service.findAll({ page: 5, limit: 20 });

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({
        total: 3,
        page: 5,
        limit: 20,
        totalPages: 1,
      });
    });
  });

  // ── findMine ────────────────────────────────────────────────────────────────

  describe('findMine', () => {
    it('devuelve los proyectos paginados del usuario vía query builder', async () => {
      const projects = [makeProject()];
      const qb = makeQueryBuilderMock([projects, 1]);
      mockProjectsRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findMine('user-uuid-1', {});

      expect(qb.innerJoin).toHaveBeenCalledWith(
        'project.developers',
        'dev',
        'dev.id = :userId',
        {
          userId: 'user-uuid-1',
        },
      );
      expect(qb.orderBy).toHaveBeenCalledWith('project.createdAt', 'ASC');
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('aplica skip/take derivados de page/limit provistos', async () => {
      const qb = makeQueryBuilderMock([[], 0]);
      mockProjectsRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findMine('user-uuid-1', { page: 2, limit: 5 });

      expect(qb.skip).toHaveBeenCalledWith(5);
      expect(qb.take).toHaveBeenCalledWith(5);
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('persiste el proyecto y devuelve ProjectResponseDto', async () => {
      const dto: CreateProjectDto = {
        name: 'New Project',
        description: 'Desc',
      };
      const created = makeProject();
      const savedWithRelations = makeProject({ developers: [] });

      mockProjectsRepository.create.mockReturnValue(created);
      mockProjectsRepository.save.mockResolvedValue(created);
      mockProjectsRepository.findOne.mockResolvedValue(savedWithRelations);

      const result = await service.create(dto);

      expect(mockProjectsRepository.create).toHaveBeenCalledWith({
        name: dto.name,
        description: dto.description,
        developers: [],
      });
      expect(mockProjectsRepository.save).toHaveBeenCalledWith(created);
      expect(result.name).toBe('Test Project');
    });

    it('usa null cuando description no se provee', async () => {
      const dto: CreateProjectDto = { name: 'No Desc' };
      const created = makeProject({ description: null });
      mockProjectsRepository.create.mockReturnValue(created);
      mockProjectsRepository.save.mockResolvedValue(created);
      mockProjectsRepository.findOne.mockResolvedValue(
        makeProject({ description: null }),
      );

      const result = await service.create(dto);

      expect(result.description).toBeNull();
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('actualiza el nombre del proyecto y devuelve el DTO', async () => {
      const project = makeProject();
      const dto: UpdateProjectDto = { name: 'Updated Name' };
      const saved = makeProject({ name: 'Updated Name' });

      mockProjectsRepository.findOne.mockResolvedValue(project);
      mockProjectsRepository.save.mockResolvedValue(saved);

      const result = await service.update('proj-uuid-1', dto);

      expect(result.name).toBe('Updated Name');
    });

    it('lanza NotFoundException (404) cuando el proyecto no existe', async () => {
      mockProjectsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── deactivate ──────────────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('establece status inactive y devuelve el DTO', async () => {
      const project = makeProject();
      const saved = makeProject({ status: ProjectStatus.INACTIVE });

      mockProjectsRepository.findOne.mockResolvedValue(project);
      mockProjectsRepository.save.mockResolvedValue(saved);

      const result = await service.deactivate('proj-uuid-1');

      expect(result.status).toBe(ProjectStatus.INACTIVE);
    });

    it('lanza BadRequestException (400) si el proyecto ya está inactivo', async () => {
      const project = makeProject({ status: ProjectStatus.INACTIVE });
      mockProjectsRepository.findOne.mockResolvedValue(project);

      await expect(service.deactivate('proj-uuid-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza NotFoundException (404) cuando el proyecto no existe', async () => {
      mockProjectsRepository.findOne.mockResolvedValue(null);

      await expect(service.deactivate('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── assignDevelopers ────────────────────────────────────────────────────────

  describe('assignDevelopers', () => {
    it('reemplaza todos los developers con la lista provista', async () => {
      const project = makeProject();
      const developer = makeUser();
      const saved = makeProject({ developers: [developer] });
      const withRelations = makeProject({ developers: [developer] });

      mockProjectsRepository.findOne
        .mockResolvedValueOnce(project)
        .mockResolvedValueOnce(withRelations);
      mockUsersRepository.find.mockResolvedValue([developer]);
      mockProjectsRepository.save.mockResolvedValue(saved);

      const dto: AssignDevelopersDto = { developerIds: ['user-uuid-1'] };
      const result = await service.assignDevelopers('proj-uuid-1', dto);

      expect(result.developers).toHaveLength(1);
      expect(result.developers[0].id).toBe('user-uuid-1');
    });

    it('limpia los developers cuando developerIds es vacío', async () => {
      const project = makeProject({ developers: [makeUser()] });
      const saved = makeProject({ developers: [] });

      mockProjectsRepository.findOne.mockResolvedValue(project);
      mockProjectsRepository.save.mockResolvedValue(saved);

      const dto: AssignDevelopersDto = { developerIds: [] };
      const result = await service.assignDevelopers('proj-uuid-1', dto);

      expect(result.developers).toHaveLength(0);
    });

    it('lanza BadRequestException (400) si un id no existe', async () => {
      const project = makeProject();
      mockProjectsRepository.findOne.mockResolvedValue(project);
      // No devuelve ningún usuario (id inexistente)
      mockUsersRepository.find.mockResolvedValue([]);

      const dto: AssignDevelopersDto = { developerIds: ['nonexistent-id'] };

      await expect(
        service.assignDevelopers('proj-uuid-1', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException (400) si un usuario tiene rol ADMIN', async () => {
      const project = makeProject();
      const adminUser = makeUser({ role: UserRole.ADMIN });

      mockProjectsRepository.findOne.mockResolvedValue(project);
      mockUsersRepository.find.mockResolvedValue([adminUser]);

      const dto: AssignDevelopersDto = { developerIds: [adminUser.id] };

      await expect(
        service.assignDevelopers('proj-uuid-1', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException (400) si un usuario está inactivo', async () => {
      const project = makeProject();
      const inactiveUser = makeUser({ isActive: false });

      mockProjectsRepository.findOne.mockResolvedValue(project);
      mockUsersRepository.find.mockResolvedValue([inactiveUser]);

      const dto: AssignDevelopersDto = { developerIds: [inactiveUser.id] };

      await expect(
        service.assignDevelopers('proj-uuid-1', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException (404) cuando el proyecto no existe', async () => {
      mockProjectsRepository.findOne.mockResolvedValue(null);

      const dto: AssignDevelopersDto = { developerIds: [] };

      await expect(
        service.assignDevelopers('nonexistent', dto),
      ).rejects.toThrow(NotFoundException);
    });

    // ── cascada de assigneeId al remover developers ────────────────────────────

    it('remueve un developer: limpia el assigneeId de sus tareas no-done en el mismo proyecto, atómicamente', async () => {
      const removedDev = makeUser({ id: 'user-removed' });
      const keptDev = makeUser({ id: 'user-kept', email: 'kept@example.com' });
      const project = makeProject({ developers: [removedDev, keptDev] });
      const withRelations = makeProject({ developers: [keptDev] });

      mockProjectsRepository.findOne
        .mockResolvedValueOnce(project)
        .mockResolvedValueOnce(withRelations);
      mockUsersRepository.find.mockResolvedValue([keptDev]);
      mockManager.save.mockResolvedValue(project);
      mockManager.update.mockResolvedValue({ affected: 1 });

      const dto: AssignDevelopersDto = { developerIds: ['user-kept'] };
      await service.assignDevelopers('proj-uuid-1', dto);

      expect(mockProjectsRepository.manager.transaction).toHaveBeenCalledTimes(
        1,
      );
      expect(mockManager.save).toHaveBeenCalledTimes(1);
      expect(mockManager.update).toHaveBeenCalledWith(
        Task,
        {
          projectId: In(['proj-uuid-1']),
          assigneeId: In(['user-removed']),
          status: Not(TaskStatus.DONE),
        },
        { assigneeId: null },
      );
    });

    it('excluye tareas done: la cascada sigue invocándose pero con criterio Not(DONE)', async () => {
      const removedDev = makeUser({ id: 'user-removed' });
      const project = makeProject({ developers: [removedDev] });
      const withRelations = makeProject({ developers: [] });

      mockProjectsRepository.findOne
        .mockResolvedValueOnce(project)
        .mockResolvedValueOnce(withRelations);
      mockManager.save.mockResolvedValue(project);
      mockManager.update.mockResolvedValue({ affected: 0 });

      const dto: AssignDevelopersDto = { developerIds: [] };
      await service.assignDevelopers('proj-uuid-1', dto);

      expect(mockManager.update).toHaveBeenCalledWith(
        Task,
        expect.objectContaining({ status: Not(TaskStatus.DONE) }),
        { assigneeId: null },
      );
    });

    it('scoping: la cascada solo afecta al proyecto sobre el que se llamó assignDevelopers', async () => {
      const removedDev = makeUser({ id: 'user-removed' });
      const project = makeProject({
        id: 'proj-scoped',
        developers: [removedDev],
      });
      const withRelations = makeProject({ id: 'proj-scoped', developers: [] });

      mockProjectsRepository.findOne
        .mockResolvedValueOnce(project)
        .mockResolvedValueOnce(withRelations);
      mockManager.save.mockResolvedValue(project);
      mockManager.update.mockResolvedValue({ affected: 1 });

      const dto: AssignDevelopersDto = { developerIds: [] };
      await service.assignDevelopers('proj-scoped', dto);

      expect(mockManager.update).toHaveBeenCalledWith(
        Task,
        expect.objectContaining({ projectId: In(['proj-scoped']) }),
        { assigneeId: null },
      );
    });

    it('rollback: si manager.save falla, no se persiste ningún cambio (transacción completa se revierte)', async () => {
      const removedDev = makeUser({ id: 'user-removed' });
      const project = makeProject({ developers: [removedDev] });

      mockProjectsRepository.findOne.mockResolvedValueOnce(project);
      mockManager.save.mockRejectedValue(new Error('DB write failed'));

      const dto: AssignDevelopersDto = { developerIds: [] };

      await expect(
        service.assignDevelopers('proj-uuid-1', dto),
      ).rejects.toThrow('DB write failed');
      // El fallo dentro de manager.save ocurre antes de la cascada: update no debe llamarse
      expect(mockManager.update).not.toHaveBeenCalled();
    });

    it('developerIds vacío (early-return branch): también dispara la cascada transaccional', async () => {
      const removedDev1 = makeUser({ id: 'user-removed-1' });
      const removedDev2 = makeUser({
        id: 'user-removed-2',
        email: 'r2@example.com',
      });
      const project = makeProject({ developers: [removedDev1, removedDev2] });
      const withRelations = makeProject({ developers: [] });

      mockProjectsRepository.findOne
        .mockResolvedValueOnce(project)
        .mockResolvedValueOnce(withRelations);
      mockManager.save.mockResolvedValue(project);
      mockManager.update.mockResolvedValue({ affected: 2 });

      const dto: AssignDevelopersDto = { developerIds: [] };
      await service.assignDevelopers('proj-uuid-1', dto);

      // No debe consultar usersRepository en la rama de vaciado
      expect(mockUsersRepository.find).not.toHaveBeenCalled();
      expect(mockProjectsRepository.manager.transaction).toHaveBeenCalledTimes(
        1,
      );
      expect(mockManager.update).toHaveBeenCalledWith(
        Task,
        expect.objectContaining({
          assigneeId: In(['user-removed-1', 'user-removed-2']),
        }),
        { assigneeId: null },
      );
    });
  });
});
