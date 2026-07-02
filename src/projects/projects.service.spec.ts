import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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
  } as Project;
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
  } as User;
}

// ── Mocks de repositorios ───────────────────────────────────────────────────────

const mockProjectsRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockUsersRepository = {
  find: jest.fn(),
};

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
    it('devuelve la lista de proyectos mapeados a ProjectResponseDto', async () => {
      const projects = [makeProject(), makeProject({ id: 'proj-uuid-2', name: 'Another' })];
      mockProjectsRepository.find.mockResolvedValue(projects);

      const result = await service.findAll();

      expect(mockProjectsRepository.find).toHaveBeenCalledWith({ relations: { developers: true } });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('proj-uuid-1');
    });

    it('devuelve array vacío cuando no hay proyectos', async () => {
      mockProjectsRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('persiste el proyecto y devuelve ProjectResponseDto', async () => {
      const dto: CreateProjectDto = { name: 'New Project', description: 'Desc' };
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
      mockProjectsRepository.findOne.mockResolvedValue(makeProject({ description: null }));

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

      await expect(service.update('nonexistent', { name: 'X' })).rejects.toThrow(NotFoundException);
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

      await expect(service.deactivate('proj-uuid-1')).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException (404) cuando el proyecto no existe', async () => {
      mockProjectsRepository.findOne.mockResolvedValue(null);

      await expect(service.deactivate('nonexistent')).rejects.toThrow(NotFoundException);
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

      await expect(service.assignDevelopers('proj-uuid-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException (400) si un usuario tiene rol ADMIN', async () => {
      const project = makeProject();
      const adminUser = makeUser({ role: UserRole.ADMIN });

      mockProjectsRepository.findOne.mockResolvedValue(project);
      mockUsersRepository.find.mockResolvedValue([adminUser]);

      const dto: AssignDevelopersDto = { developerIds: [adminUser.id] };

      await expect(service.assignDevelopers('proj-uuid-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException (400) si un usuario está inactivo', async () => {
      const project = makeProject();
      const inactiveUser = makeUser({ isActive: false });

      mockProjectsRepository.findOne.mockResolvedValue(project);
      mockUsersRepository.find.mockResolvedValue([inactiveUser]);

      const dto: AssignDevelopersDto = { developerIds: [inactiveUser.id] };

      await expect(service.assignDevelopers('proj-uuid-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException (404) cuando el proyecto no existe', async () => {
      mockProjectsRepository.findOne.mockResolvedValue(null);

      const dto: AssignDevelopersDto = { developerIds: [] };

      await expect(service.assignDevelopers('nonexistent', dto)).rejects.toThrow(NotFoundException);
    });
  });
});
