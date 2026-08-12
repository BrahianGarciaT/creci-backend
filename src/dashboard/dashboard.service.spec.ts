import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Project } from '../projects/projects.entity';
import { Task, TaskStatus } from '../tasks/tasks.entity';
import { User, UserRole } from '../users/users.entity';
import { DashboardService } from './dashboard.service';

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

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-uuid-1',
    name: 'Test Project',
    description: null,
    status: 'active' as any,
    developers: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ── Mock query builder ──────────────────────────────────────────────────────────
// Encadena todos los métodos usados por DashboardService y resuelve con el valor
// configurado en cada test vía las funciones terminales (getRawMany/getMany/getCount)

function makeQueryBuilderMock() {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
  };
  return qb;
}

describe('DashboardService', () => {
  let service: DashboardService;
  let taskQb: ReturnType<typeof makeQueryBuilderMock>;
  let projectQb: ReturnType<typeof makeQueryBuilderMock>;
  let mockTasksRepository: any;
  let mockProjectsRepository: any;

  beforeEach(async () => {
    taskQb = makeQueryBuilderMock();
    projectQb = makeQueryBuilderMock();

    mockTasksRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(taskQb),
    };
    mockProjectsRepository = {
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(projectQb),
    };
    const mockUsersRepository = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(Task), useValue: mockTasksRepository },
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectsRepository,
        },
        { provide: getRepositoryToken(User), useValue: mockUsersRepository },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Shaping helpers ──────────────────────────────────────────────────────────

  describe('getStatusCountsByProject', () => {
    it('pivotea los conteos crudos y siembra las 4 claves en 0', async () => {
      taskQb.getRawMany.mockResolvedValue([
        { projectId: 'p1', status: TaskStatus.DONE, count: '3' },
        { projectId: 'p1', status: TaskStatus.TODO, count: '2' },
      ]);

      const result = await service.getStatusCountsByProject(['p1']);

      expect(result.get('p1')).toEqual({
        [TaskStatus.TODO]: 2,
        [TaskStatus.IN_PROGRESS]: 0,
        [TaskStatus.DONE]: 3,
        [TaskStatus.CANCELLED]: 0,
      });
    });

    it('coerciona COUNT (string de pg) a number', async () => {
      taskQb.getRawMany.mockResolvedValue([
        { projectId: 'p1', status: TaskStatus.DONE, count: '10' },
      ]);

      const result = await service.getStatusCountsByProject(['p1']);

      expect(typeof result.get('p1')![TaskStatus.DONE]).toBe('number');
      expect(result.get('p1')![TaskStatus.DONE]).toBe(10);
    });

    it('devuelve un mapa vacío sin consultar la base de datos cuando projectIds está vacío', async () => {
      const result = await service.getStatusCountsByProject([]);

      expect(result.size).toBe(0);
      expect(mockTasksRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('buildProjectHealth', () => {
    it('calcula completionRate como null cuando total es 0', () => {
      const projects = [makeProject({ id: 'p1' })];
      const countsByProject = new Map([
        [
          'p1',
          {
            [TaskStatus.TODO]: 0,
            [TaskStatus.IN_PROGRESS]: 0,
            [TaskStatus.DONE]: 0,
            [TaskStatus.CANCELLED]: 0,
          },
        ],
      ]);

      const result = service.buildProjectHealth(projects, countsByProject);

      expect(result[0].total).toBe(0);
      expect(result[0].completionRate).toBeNull();
    });

    it('calcula completionRate correctamente cuando hay tareas', () => {
      const projects = [makeProject({ id: 'p1' })];
      const countsByProject = new Map([
        [
          'p1',
          {
            [TaskStatus.TODO]: 1,
            [TaskStatus.IN_PROGRESS]: 1,
            [TaskStatus.DONE]: 2,
            [TaskStatus.CANCELLED]: 0,
          },
        ],
      ]);

      const result = service.buildProjectHealth(projects, countsByProject);

      expect(result[0].total).toBe(4);
      expect(result[0].completionRate).toBe(0.5);
    });
  });

  describe('getCompletionTrend', () => {
    it('devuelve una serie de 30 días zero-filled', async () => {
      taskQb.getRawMany.mockResolvedValue([]);

      const trend = await service.getCompletionTrend(['p1']);

      expect(trend.granularity).toBe('day');
      expect(trend.points).toHaveLength(30);
      expect(trend.points.every((point) => point.count === 0)).toBe(true);
    });

    it('rellena solo los días con conteos reales, el resto queda en 0', async () => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      taskQb.getRawMany.mockResolvedValue([
        { day: today.toISOString(), count: '5' },
      ]);

      const trend = await service.getCompletionTrend(['p1']);

      const todayKey = today.toISOString().slice(0, 10);
      const todayPoint = trend.points.find((point) => point.date === todayKey);
      expect(todayPoint?.count).toBe(5);
      expect(trend.points.filter((point) => point.count === 0)).toHaveLength(
        29,
      );
    });

    it('no consulta la base de datos cuando projectIds está vacío, y aun así zero-fillea', async () => {
      const trend = await service.getCompletionTrend([]);

      expect(mockTasksRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(trend.points).toHaveLength(30);
    });
  });

  describe('getOverdue', () => {
    it('excluye tareas cancelled del resultado (vía predicado de la query, no filtrado adicional)', async () => {
      taskQb.getCount.mockResolvedValue(0);
      taskQb.getMany.mockResolvedValue([]);

      const result = await service.getOverdue(['p1']);

      expect(result.overdue).toEqual([]);
      expect(result.overdueCount).toBe(0);
      expect(taskQb.andWhere).toHaveBeenCalledWith(
        'task.status NOT IN (:...excluded)',
        expect.objectContaining({
          excluded: [TaskStatus.DONE, TaskStatus.CANCELLED],
        }),
      );
    });

    it('devuelve overdueCount preciso incluso si la lista está truncada a 50', async () => {
      taskQb.getCount.mockResolvedValue(120);
      taskQb.getMany.mockResolvedValue([]);

      const result = await service.getOverdue(['p1']);

      expect(result.overdueCount).toBe(120);
    });

    it('devuelve vacío sin consultar cuando projectIds está vacío', async () => {
      const result = await service.getOverdue([]);

      expect(result).toEqual({ overdue: [], overdueCount: 0 });
      expect(mockTasksRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('getWorkload', () => {
    it('coerciona los conteos de string a number', async () => {
      taskQb.getRawMany.mockResolvedValue([
        {
          userId: 'u1',
          email: 'dev@example.com',
          open: '3',
          done: '5',
          overdue: '1',
        },
      ]);

      const result = await service.getWorkload(['p1']);

      expect(result).toEqual([
        {
          userId: 'u1',
          email: 'dev@example.com',
          open: 3,
          done: 5,
          overdue: 1,
        },
      ]);
    });

    it('devuelve vacío sin consultar cuando projectIds está vacío', async () => {
      const result = await service.getWorkload([]);

      expect(result).toEqual([]);
      expect(mockTasksRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ── Role branching ───────────────────────────────────────────────────────────

  describe('getOverview', () => {
    it('ADMIN ve todos los proyectos de la organización (scope: org)', async () => {
      const admin = makeUser({ role: UserRole.ADMIN });
      mockProjectsRepository.find.mockResolvedValue([
        makeProject({ id: 'p1' }),
      ]);
      taskQb.getRawMany.mockResolvedValue([]);
      taskQb.getMany.mockResolvedValue([]);
      taskQb.getCount.mockResolvedValue(0);

      const result = await service.getOverview(admin);

      expect(result.scope).toBe('org');
      expect(mockProjectsRepository.find).toHaveBeenCalledTimes(1);
      expect(mockProjectsRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(result.projects).toHaveLength(1);
    });

    it('DEVELOPER ve solo los proyectos donde participa (scope: participant)', async () => {
      const dev = makeUser({ id: 'dev-1' });
      projectQb.getMany.mockResolvedValue([makeProject({ id: 'p2' })]);
      taskQb.getRawMany.mockResolvedValue([]);
      taskQb.getMany.mockResolvedValue([]);
      taskQb.getCount.mockResolvedValue(0);

      const result = await service.getOverview(dev);

      expect(result.scope).toBe('participant');
      expect(mockProjectsRepository.find).not.toHaveBeenCalled();
      expect(mockProjectsRepository.createQueryBuilder).toHaveBeenCalledWith(
        'project',
      );
      expect(projectQb.innerJoin).toHaveBeenCalledWith(
        'project.developers',
        'dev',
        'dev.id = :userId',
        { userId: 'dev-1' },
      );
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].projectId).toBe('p2');
    });

    it('developer con cero proyectos recibe un payload vacío válido, sin error', async () => {
      const dev = makeUser({ id: 'lonely-dev' });
      projectQb.getMany.mockResolvedValue([]);

      const result = await service.getOverview(dev);

      expect(result).toEqual({
        scope: 'participant',
        projects: [],
        workload: [],
        overdue: [],
        overdueCount: 0,
        trend: expect.objectContaining({
          granularity: 'day',
          points: expect.any(Array),
        }),
      });
      expect(result.trend.points).toHaveLength(30);
      // ninguna query de tareas debe dispararse cuando no hay proyectos
      expect(mockTasksRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
