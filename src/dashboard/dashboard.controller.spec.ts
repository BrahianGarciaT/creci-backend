import { Test, TestingModule } from '@nestjs/testing';
import { User, UserRole } from '../users/users.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardOverviewDto } from './dto/dashboard-overview.dto';

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

// ── Mock del servicio ───────────────────────────────────────────────────────────

const mockDashboardService = {
  getOverview: jest.fn(),
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

  // ── Metadatos de guards ──────────────────────────────────────────────────────

  describe('sin @Roles', () => {
    it('el handler getOverview no tiene @Roles (JWT-only, scoping a nivel de datos)', () => {
      const roles: UserRole[] | undefined = Reflect.getMetadata(
        'roles',
        controller.getOverview,
      );
      expect(roles).toBeUndefined();
    });
  });
});
