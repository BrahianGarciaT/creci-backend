import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProjectAccessService } from '../projects/project-access.service';
import { Project, ProjectStatus } from '../projects/projects.entity';
import { Task, TaskStatus } from '../tasks/tasks.entity';
import { User, UserRole } from '../users/users.entity';
import { DashboardService } from './dashboard.service';
import { CompletionTrend, TrendPoint } from './dto/dashboard-overview.dto';

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
    status: ProjectStatus.ACTIVE,
    developers: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ── Mock query builder ──────────────────────────────────────────────────────────
// Encadena todos los métodos usados por DashboardService y resuelve con el valor
// configurado en cada test vía las funciones terminales (getRawMany/getMany/getCount)

type MockQueryBuilder = Record<
  | 'select'
  | 'addSelect'
  | 'where'
  | 'andWhere'
  | 'innerJoin'
  | 'leftJoinAndSelect'
  | 'groupBy'
  | 'addGroupBy'
  | 'orderBy'
  | 'limit'
  | 'setParameters'
  | 'getRawMany'
  | 'getMany'
  | 'getCount',
  jest.Mock
>;

// Métodos encadenables (devuelven el propio qb); getRawMany/getMany/getCount son
// terminales y resuelven el valor configurado en cada test.
const CHAINABLE_QB_METHODS = [
  'select',
  'addSelect',
  'where',
  'andWhere',
  'innerJoin',
  'leftJoinAndSelect',
  'groupBy',
  'addGroupBy',
  'orderBy',
  'limit',
  'setParameters',
] as const;

function makeQueryBuilderMock(): MockQueryBuilder {
  const qb = {
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    innerJoin: jest.fn(),
    leftJoinAndSelect: jest.fn(),
    groupBy: jest.fn(),
    addGroupBy: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    setParameters: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
  };
  for (const method of CHAINABLE_QB_METHODS) {
    qb[method].mockReturnValue(qb);
  }
  return qb;
}

type MockTasksRepository = { createQueryBuilder: jest.Mock };
type MockProjectsRepository = {
  find: jest.Mock;
  findOne: jest.Mock;
  createQueryBuilder: jest.Mock;
};

describe('DashboardService', () => {
  let service: DashboardService;
  let taskQb: ReturnType<typeof makeQueryBuilderMock>;
  let projectQb: ReturnType<typeof makeQueryBuilderMock>;
  let mockTasksRepository: MockTasksRepository;
  let mockProjectsRepository: MockProjectsRepository;
  let mockProjectAccessService: { assertCanRead: jest.Mock };

  beforeEach(async () => {
    taskQb = makeQueryBuilderMock();
    projectQb = makeQueryBuilderMock();

    mockTasksRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(taskQb),
    };
    mockProjectsRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(projectQb),
    };
    const mockUsersRepository = {};
    mockProjectAccessService = {
      assertCanRead: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(Task), useValue: mockTasksRepository },
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectsRepository,
        },
        { provide: getRepositoryToken(User), useValue: mockUsersRepository },
        {
          provide: ProjectAccessService,
          useValue: mockProjectAccessService,
        },
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
          points: expect.any(Array) as TrendPoint[],
        }) as CompletionTrend,
      });
      expect(result.trend.points).toHaveLength(30);
      // ninguna query de tareas debe dispararse cuando no hay proyectos
      expect(mockTasksRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ── GET /dashboard/projects/:id ──────────────────────────────────────────────

  describe('getProjectDetail', () => {
    it('llama a assertCanRead(id, user, { allowAdmin: true }) antes de consultar', async () => {
      const admin = makeUser({ role: UserRole.ADMIN });
      mockProjectsRepository.findOne.mockResolvedValue(
        makeProject({ id: 'p1' }),
      );
      taskQb.getRawMany.mockResolvedValue([]);
      taskQb.getMany.mockResolvedValue([]);
      taskQb.getCount.mockResolvedValue(0);

      await service.getProjectDetail('p1', admin);

      expect(mockProjectAccessService.assertCanRead).toHaveBeenCalledWith(
        'p1',
        admin,
        { allowAdmin: true },
      );
    });

    it('propaga ForbiddenException de assertCanRead sin consultar tareas (developer no miembro)', async () => {
      const dev = makeUser({ id: 'outsider' });
      mockProjectAccessService.assertCanRead.mockRejectedValue(
        new ForbiddenException('You are not a member of this project'),
      );

      await expect(service.getProjectDetail('p1', dev)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockProjectsRepository.findOne).not.toHaveBeenCalled();
      expect(mockTasksRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException cuando el proyecto no existe', async () => {
      const admin = makeUser({ role: UserRole.ADMIN });
      mockProjectsRepository.findOne.mockResolvedValue(null);

      await expect(service.getProjectDetail('missing', admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('proyecto sin tareas → counts en 0, trend vacío zero-filled, sin error', async () => {
      const admin = makeUser({ role: UserRole.ADMIN });
      mockProjectsRepository.findOne.mockResolvedValue(
        makeProject({ id: 'p1', name: 'Empty Project' }),
      );
      taskQb.getRawMany.mockResolvedValue([]);
      taskQb.getMany.mockResolvedValue([]);
      taskQb.getCount.mockResolvedValue(0);

      const result = await service.getProjectDetail('p1', admin);

      expect(result).toEqual({
        projectId: 'p1',
        name: 'Empty Project',
        total: 0,
        counts: {
          [TaskStatus.TODO]: 0,
          [TaskStatus.IN_PROGRESS]: 0,
          [TaskStatus.DONE]: 0,
          [TaskStatus.CANCELLED]: 0,
        },
        workload: [],
        overdue: [],
        overdueCount: 0,
        trend: expect.objectContaining({
          granularity: 'day',
          points: expect.any(Array) as TrendPoint[],
        }) as CompletionTrend,
      });
      expect(result.trend.points).toHaveLength(30);
      expect(result.trend.points.every((point) => point.count === 0)).toBe(
        true,
      );
    });

    it('proyecto sin tareas completadas → trend válido con puntos en 0 (no error)', async () => {
      const admin = makeUser({ role: UserRole.ADMIN });
      mockProjectsRepository.findOne.mockResolvedValue(
        makeProject({ id: 'p1' }),
      );
      // getRawMany se comparte entre getStatusCountsByProject, getWorkload y
      // getCompletionTrend (mismo query builder mock); encolar por orden de
      // invocación evita que las filas de "counts" se cuelen en el shaping del trend
      taskQb.getRawMany
        .mockResolvedValueOnce([
          { projectId: 'p1', status: TaskStatus.TODO, count: '3' },
        ]) // counts
        .mockResolvedValueOnce([]) // workload
        .mockResolvedValueOnce([]); // trend
      taskQb.getMany.mockResolvedValue([]);
      taskQb.getCount.mockResolvedValue(0);

      const result = await service.getProjectDetail('p1', admin);

      expect(result.total).toBe(3);
      expect(result.trend.points).toHaveLength(30);
      expect(result.trend.points.every((point) => point.count === 0)).toBe(
        true,
      );
    });

    it('escopa las queries a un único projectId (no al resto de proyectos)', async () => {
      const admin = makeUser({ role: UserRole.ADMIN });
      mockProjectsRepository.findOne.mockResolvedValue(
        makeProject({ id: 'p1' }),
      );
      taskQb.getRawMany.mockResolvedValue([]);
      taskQb.getMany.mockResolvedValue([]);
      taskQb.getCount.mockResolvedValue(0);

      await service.getProjectDetail('p1', admin);

      expect(taskQb.where).toHaveBeenCalledWith(
        'task.projectId IN (:...projectIds)',
        { projectIds: ['p1'] },
      );
    });
  });
});
