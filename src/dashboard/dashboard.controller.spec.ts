import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { User, UserRole } from '../users/users.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import {
  DashboardOverviewDto,
  ProjectDashboardDto,
} from './dto/dashboard-overview.dto';

// ── Helpers de fixture ─────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-uuid-1',
    email: 'dev@example.com',
    password: 'hashed',
    role: UserRole.DEVELOPER,
    isActive: true,
    refreshToken: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeOverviewDto(
  overrides: Partial<DashboardOverviewDto> = {},
): DashboardOverviewDto {
  return {
    scope: 'participant',
    projects: [],
    workload: [],
    overdue: [],
    overdueCount: 0,
    trend: {
      granularity: 'day',
      from: '2024-01-01',
      to: '2024-01-30',
      points: [],
    },
    ...overrides,
  };
}

function makeProjectDashboardDto(
  overrides: Partial<ProjectDashboardDto> = {},
): ProjectDashboardDto {
  return {
    projectId: 'proj-uuid-1',
    name: 'Test Project',
    total: 0,
    counts: { todo: 0, in_progress: 0, done: 0, cancelled: 0 },
    workload: [],
    overdue: [],
    overdueCount: 0,
    trend: {
      granularity: 'day',
      from: '2024-01-01',
      to: '2024-01-30',
      points: [],
    },
    ...overrides,
  };
}

// ── Mock del servicio ───────────────────────────────────────────────────────────

const mockDashboardService = {
  getOverview: jest.fn(),
  getProjectDetail: jest.fn(),
};

describe('DashboardController', () => {
  let controller: DashboardController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: mockDashboardService },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  afterEach(() => jest.clearAllMocks());

  // ── GET /dashboard/overview ─────────────────────────────────────────────────

  describe('getOverview', () => {
    it('llama a DashboardService.getOverview con el usuario actual (admin)', async () => {
      const admin = makeUser({ role: UserRole.ADMIN });
      const dto = makeOverviewDto({ scope: 'org' });
      mockDashboardService.getOverview.mockResolvedValue(dto);

      const result = await controller.getOverview(admin);

      expect(mockDashboardService.getOverview).toHaveBeenCalledWith(admin);
      expect(result.scope).toBe('org');
    });

    it('llama a DashboardService.getOverview con el usuario actual (developer)', async () => {
      const dev = makeUser();
      const dto = makeOverviewDto({ scope: 'participant' });
      mockDashboardService.getOverview.mockResolvedValue(dto);

      const result = await controller.getOverview(dev);

      expect(mockDashboardService.getOverview).toHaveBeenCalledWith(dev);
      expect(result.scope).toBe('participant');
    });
  });

  // ── GET /dashboard/projects/:id ─────────────────────────────────────────────

  describe('getProjectDetail', () => {
    it('llama a DashboardService.getProjectDetail con el id y el usuario actual', async () => {
      const admin = makeUser({ role: UserRole.ADMIN });
      const dto = makeProjectDashboardDto({ projectId: 'p1' });
      mockDashboardService.getProjectDetail.mockResolvedValue(dto);

      const result = await controller.getProjectDetail('p1', admin);

      expect(mockDashboardService.getProjectDetail).toHaveBeenCalledWith(
        'p1',
        admin,
      );
      expect(result.projectId).toBe('p1');
    });

    it('propaga ForbiddenException lanzada por el servicio (developer no miembro)', async () => {
      const dev = makeUser();
      mockDashboardService.getProjectDetail.mockRejectedValue(
        new ForbiddenException('You are not a member of this project'),
      );

      await expect(controller.getProjectDetail('p1', dev)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('propaga NotFoundException lanzada por el servicio (proyecto inexistente)', async () => {
      const admin = makeUser({ role: UserRole.ADMIN });
      mockDashboardService.getProjectDetail.mockRejectedValue(
        new NotFoundException('Project not found'),
      );

      await expect(
        controller.getProjectDetail('missing', admin),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── Metadatos de guards ──────────────────────────────────────────────────────

  // Reflect.getMetadata necesita la referencia exacta a la función del método
  // (ahí es donde el decorador @Roles adjunta la metadata) — .bind() crearía
  // una función nueva sin esa metadata, así que no es una alternativa válida.
  // Re-tipar el controller como Record<string, object> evita que TS vea estas
  // propiedades como "métodos de clase con this" (lo que dispara unbound-method)
  // sin alterar la referencia real que se le pasa a Reflect.getMetadata.
  function getRolesMetadata(
    methodName: keyof DashboardController,
  ): UserRole[] | undefined {
    const proto = controller as unknown as Record<string, object>;
    return Reflect.getMetadata('roles', proto[methodName]) as
      | UserRole[]
      | undefined;
  }

  describe('sin @Roles', () => {
    it('el handler getOverview no tiene @Roles (JWT-only, scoping a nivel de datos)', () => {
      const roles = getRolesMetadata('getOverview');
      expect(roles).toBeUndefined();
    });

    it('el handler getProjectDetail no tiene @Roles (JWT-only, assertCanRead en el servicio)', () => {
      const roles = getRolesMetadata('getProjectDetail');
      expect(roles).toBeUndefined();
    });
  });
});
