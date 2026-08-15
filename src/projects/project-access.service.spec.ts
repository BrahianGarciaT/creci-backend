import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, UserRole } from '../users/users.entity';
import { ProjectAccessService } from './project-access.service';
import { Project, ProjectStatus } from './projects.entity';

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
  };
}

const mockProjectsRepository = {
  findOne: jest.fn(),
};

describe('ProjectAccessService', () => {
  let service: ProjectAccessService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectAccessService,
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectsRepository,
        },
      ],
    }).compile();

    service = module.get<ProjectAccessService>(ProjectAccessService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('assertCanRead', () => {
    it('lanza NotFoundException (404) cuando el proyecto no existe', async () => {
      mockProjectsRepository.findOne.mockResolvedValue(null);
      const dev = makeUser();

      await expect(
        service.assertCanRead('nonexistent', dev, { allowAdmin: false }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException (403) cuando el developer no es miembro (allowAdmin: false)', async () => {
      const dev = makeUser({ id: 'outsider-id' });
      const project = makeProject({
        developers: [makeUser({ id: 'member-id' })],
      });
      mockProjectsRepository.findOne.mockResolvedValue(project);

      await expect(
        service.assertCanRead('proj-uuid-1', dev, { allowAdmin: false }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('permite el acceso a un developer miembro (allowAdmin: false)', async () => {
      const dev = makeUser();
      const project = makeProject({ developers: [dev] });
      mockProjectsRepository.findOne.mockResolvedValue(project);

      await expect(
        service.assertCanRead('proj-uuid-1', dev, { allowAdmin: false }),
      ).resolves.toBeUndefined();
    });

    it('lanza ForbiddenException (403) para un admin no miembro cuando allowAdmin es false', async () => {
      const admin = makeUser({ id: 'admin-id', role: UserRole.ADMIN });
      const project = makeProject({
        developers: [makeUser({ id: 'member-id' })],
      });
      mockProjectsRepository.findOne.mockResolvedValue(project);

      await expect(
        service.assertCanRead('proj-uuid-1', admin, { allowAdmin: false }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('permite el acceso a un admin no miembro cuando allowAdmin es true', async () => {
      const admin = makeUser({ id: 'admin-id', role: UserRole.ADMIN });
      const project = makeProject({
        developers: [makeUser({ id: 'member-id' })],
      });
      mockProjectsRepository.findOne.mockResolvedValue(project);

      await expect(
        service.assertCanRead('proj-uuid-1', admin, { allowAdmin: true }),
      ).resolves.toBeUndefined();
    });

    it('lanza ForbiddenException (403) para un developer no miembro cuando allowAdmin es true', async () => {
      const dev = makeUser({ id: 'outsider-id' });
      const project = makeProject({
        developers: [makeUser({ id: 'member-id' })],
      });
      mockProjectsRepository.findOne.mockResolvedValue(project);

      await expect(
        service.assertCanRead('proj-uuid-1', dev, { allowAdmin: true }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('permite el acceso a un developer miembro cuando allowAdmin es true', async () => {
      const dev = makeUser();
      const project = makeProject({ developers: [dev] });
      mockProjectsRepository.findOne.mockResolvedValue(project);

      await expect(
        service.assertCanRead('proj-uuid-1', dev, { allowAdmin: true }),
      ).resolves.toBeUndefined();
    });
  });
});
