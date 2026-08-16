import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';
import { FindManyOptions } from 'typeorm';
import { Project, ProjectStatus } from '../projects/projects.entity';
import { ProjectAccessService } from '../projects/project-access.service';
import { User, UserRole } from '../users/users.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateEstimateDto } from './dto/update-estimate.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task, TaskPriority, TaskStatus } from './tasks.entity';
import { TasksService } from './tasks.service';

// ── Helpers de fixture ─────────────────────────────────────────────────────────

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

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-uuid-1',
    title: 'Test Task',
    description: null,
    status: TaskStatus.TODO,
    priority: TaskPriority.MEDIUM,
    dueDate: null,
    estimatedHours: null,
    projectId: 'proj-uuid-1',
    project: makeProject(),
    assigneeId: null,
    assignee: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  } as Task;
}

// ── Mocks de repositorios ──────────────────────────────────────────────────────

const mockTasksRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn<Promise<[Task[], number]>, [FindManyOptions<Task>]>(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockProjectsRepository = {
  findOne: jest.fn(),
};

const mockLogger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
};

const mockUsersRepository = {
  findOne: jest.fn(),
};

const mockProjectAccessService = {
  assertCanRead: jest.fn(),
};

// ── Suite principal ────────────────────────────────────────────────────────────

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getRepositoryToken(Task), useValue: mockTasksRepository },
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectsRepository,
        },
        { provide: getRepositoryToken(User), useValue: mockUsersRepository },
        { provide: ProjectAccessService, useValue: mockProjectAccessService },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('persiste la tarea y devuelve TaskResponseDto', async () => {
      const dto: CreateTaskDto = {
        title: 'Nueva tarea',
        priority: TaskPriority.HIGH,
        projectId: 'proj-uuid-1',
      };
      const task = makeTask({
        title: 'Nueva tarea',
        priority: TaskPriority.HIGH,
      });

      mockProjectsRepository.findOne.mockResolvedValue(makeProject());
      mockTasksRepository.create.mockReturnValue(task);
      mockTasksRepository.save.mockResolvedValue(task);

      const result = await service.create(dto);

      expect(mockProjectsRepository.findOne).toHaveBeenCalledWith({
        where: { id: dto.projectId },
        relations: { developers: true },
      });
      expect(mockTasksRepository.save).toHaveBeenCalled();
      expect(result.title).toBe('Nueva tarea');
      expect(result.status).toBe(TaskStatus.TODO);
    });

    it('lanza NotFoundException (404) cuando el proyecto no existe', async () => {
      mockProjectsRepository.findOne.mockResolvedValue(null);

      const dto: CreateTaskDto = {
        title: 'Tarea',
        priority: TaskPriority.LOW,
        projectId: 'nonexistent',
      };

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException (404) cuando el assigneeId no existe', async () => {
      mockProjectsRepository.findOne.mockResolvedValue(makeProject());
      mockUsersRepository.findOne.mockResolvedValue(null);

      const dto: CreateTaskDto = {
        title: 'Tarea',
        priority: TaskPriority.LOW,
        projectId: 'proj-uuid-1',
        assigneeId: 'nonexistent-user',
      };

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException (400) cuando el assignee no pertenece al proyecto', async () => {
      const outsider = makeUser({ id: 'outsider-id' });
      mockUsersRepository.findOne.mockResolvedValue(outsider);
      mockProjectsRepository.findOne.mockResolvedValue(
        makeProject({ developers: [makeUser({ id: 'member-id' })] }),
      );

      const dto: CreateTaskDto = {
        title: 'Tarea',
        priority: TaskPriority.LOW,
        projectId: 'proj-uuid-1',
        assigneeId: 'outsider-id',
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });

    it('crea la tarea cuando el assignee sí pertenece al proyecto', async () => {
      const member = makeUser({ id: 'member-id' });
      const task = makeTask({ assigneeId: 'member-id' });

      mockUsersRepository.findOne.mockResolvedValue(member);
      mockProjectsRepository.findOne.mockResolvedValue(
        makeProject({ developers: [member] }),
      );
      mockTasksRepository.create.mockReturnValue(task);
      mockTasksRepository.save.mockResolvedValue(task);

      const dto: CreateTaskDto = {
        title: 'Tarea',
        priority: TaskPriority.LOW,
        projectId: 'proj-uuid-1',
        assigneeId: 'member-id',
      };

      const result = await service.create(dto);

      expect(result.assigneeId).toBe('member-id');
    });

    it('crea la tarea sin asignar cuando assigneeId es omitido/null', async () => {
      const task = makeTask({ assigneeId: null });

      mockProjectsRepository.findOne.mockResolvedValue(
        makeProject({ developers: [] }),
      );
      mockTasksRepository.create.mockReturnValue(task);
      mockTasksRepository.save.mockResolvedValue(task);

      const dto: CreateTaskDto = {
        title: 'Tarea',
        priority: TaskPriority.LOW,
        projectId: 'proj-uuid-1',
      };

      const result = await service.create(dto);

      expect(mockUsersRepository.findOne).not.toHaveBeenCalled();
      expect(result.assigneeId).toBeNull();
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('devuelve todas las tareas incluyendo canceladas, paginadas', async () => {
      const tasks = [
        makeTask({ status: TaskStatus.DONE }),
        makeTask({ id: 'task-uuid-2', status: TaskStatus.CANCELLED }),
      ];
      mockTasksRepository.findAndCount.mockResolvedValue([tasks, 2]);

      const result = await service.findAll({});

      expect(mockTasksRepository.findAndCount).toHaveBeenCalledWith({
        where: {},
        relations: { project: true, assignee: true },
        order: { createdAt: 'ASC' },
        skip: 0,
        take: 20,
      });
      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('filtra por projectId cuando se provee', async () => {
      mockTasksRepository.findAndCount.mockResolvedValue([[makeTask()], 1]);

      await service.findAll({ projectId: 'proj-uuid-1' });

      expect(mockTasksRepository.findAndCount).toHaveBeenCalledWith({
        where: { projectId: 'proj-uuid-1' },
        relations: { project: true, assignee: true },
        order: { createdAt: 'ASC' },
        skip: 0,
        take: 20,
      });
    });

    it('aplica skip/take derivados de page/limit provistos (page=2, limit=20 → items 21-40)', async () => {
      mockTasksRepository.findAndCount.mockResolvedValue([[], 50]);

      const result = await service.findAll({ page: 2, limit: 20 });

      expect(mockTasksRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
      expect(result.meta.page).toBe(2);
    });

    it('data:[] con meta.total preciso cuando page excede totalPages (sin clamping)', async () => {
      mockTasksRepository.findAndCount.mockResolvedValue([[], 3]);

      const result = await service.findAll({ page: 5, limit: 20 });

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({
        total: 3,
        page: 5,
        limit: 20,
        totalPages: 1,
      });
    });

    it('sin filtros, where no tiene claves status/priority/projectId', async () => {
      mockTasksRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({});

      const opts = mockTasksRepository.findAndCount.mock.calls[0][0];
      expect(opts.where).toEqual({});
      expect(opts.where).not.toHaveProperty('status');
      expect(opts.where).not.toHaveProperty('priority');
      expect(opts.where).not.toHaveProperty('projectId');
    });

    it('filtra por status cuando se provee', async () => {
      mockTasksRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ status: TaskStatus.DONE });

      const opts = mockTasksRepository.findAndCount.mock.calls[0][0];
      expect(opts.where).toEqual({ status: TaskStatus.DONE });
      expect(opts.where).not.toHaveProperty('priority');
      expect(opts.where).not.toHaveProperty('projectId');
    });

    it('filtra por projectId, status y priority combinados (AND)', async () => {
      mockTasksRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        projectId: 'proj-uuid-1',
        status: TaskStatus.TODO,
        priority: TaskPriority.HIGH,
      });

      expect(mockTasksRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectId: 'proj-uuid-1',
            status: TaskStatus.TODO,
            priority: TaskPriority.HIGH,
          },
        }),
      );
    });

    it('filtro y paginación coexisten en la misma llamada (filter-then-paginate)', async () => {
      mockTasksRepository.findAndCount.mockResolvedValue([[], 25]);

      const result = await service.findAll({
        status: TaskStatus.DONE,
        page: 2,
        limit: 20,
      });

      expect(mockTasksRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: TaskStatus.DONE },
          skip: 20,
          take: 20,
        }),
      );
      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        limit: 20,
        totalPages: 2,
      });
    });
  });

  // ── findByProject ────────────────────────────────────────────────────────────

  describe('findByProject', () => {
    it('devuelve tareas paginadas cuando el usuario es miembro', async () => {
      const dev = makeUser();
      const tasks = [makeTask({ status: TaskStatus.IN_PROGRESS })];

      mockProjectAccessService.assertCanRead.mockResolvedValue(undefined);
      mockTasksRepository.findAndCount.mockResolvedValue([tasks, 1]);

      const result = await service.findByProject('proj-uuid-1', dev, {});

      expect(mockProjectAccessService.assertCanRead).toHaveBeenCalledWith(
        'proj-uuid-1',
        dev,
        {
          allowAdmin: false,
        },
      );
      expect(mockTasksRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'ASC' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe(TaskStatus.IN_PROGRESS);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('lanza ForbiddenException (403) cuando el usuario no es miembro del proyecto', async () => {
      const dev = makeUser({ id: 'outsider-id' });

      mockProjectAccessService.assertCanRead.mockRejectedValue(
        new ForbiddenException('You are not a member of this project'),
      );

      await expect(
        service.findByProject('proj-uuid-1', dev, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza NotFoundException (404) cuando el proyecto no existe', async () => {
      const dev = makeUser();
      mockProjectAccessService.assertCanRead.mockRejectedValue(
        new NotFoundException('Project not found'),
      );

      await expect(
        service.findByProject('nonexistent', dev, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('incluye tareas canceladas en los resultados', async () => {
      const dev = makeUser();
      // El dev asignado debe ver que su tarea fue cancelada en vez de que
      // desaparezca sin rastro — el where ya no excluye CANCELLED.
      mockProjectAccessService.assertCanRead.mockResolvedValue(undefined);
      mockTasksRepository.findAndCount.mockResolvedValue([
        [
          makeTask({ status: TaskStatus.TODO }),
          makeTask({ id: 'task-uuid-2', status: TaskStatus.CANCELLED }),
        ],
        2,
      ]);

      const result = await service.findByProject('proj-uuid-1', dev, {});

      // Verifica que la query no filtra por status (solo por projectId)
      expect(mockTasksRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: 'proj-uuid-1' } as FindManyOptions<Task>['where'],
        }),
      );
      expect(result.data.some((t) => t.status === TaskStatus.CANCELLED)).toBe(
        true,
      );
    });

    it('aplica skip/take derivados de page/limit provistos', async () => {
      mockProjectAccessService.assertCanRead.mockResolvedValue(undefined);
      mockTasksRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findByProject('proj-uuid-1', makeUser(), {
        page: 2,
        limit: 5,
      });

      expect(mockTasksRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });
  });

  // ── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('actualiza campos parciales y devuelve el DTO', async () => {
      const task = makeTask();
      const dto: UpdateTaskDto = { title: 'Título actualizado' };
      const saved = makeTask({ title: 'Título actualizado' });

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockResolvedValue(saved);

      const result = await service.update('task-uuid-1', dto);

      expect(result.title).toBe('Título actualizado');
    });

    it('lanza NotFoundException (404) cuando la tarea no existe', async () => {
      mockTasksRepository.findOne.mockResolvedValue(null);

      await expect(service.update('nonexistent', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza BadRequestException (400) cuando intenta reabrir una tarea done', async () => {
      const task = makeTask({ status: TaskStatus.DONE });
      const dto: UpdateTaskDto = { status: TaskStatus.TODO };

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(service.update('task-uuid-1', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });

    it('permite el no-op done -> done', async () => {
      const task = makeTask({ status: TaskStatus.DONE });
      const dto: UpdateTaskDto = { status: TaskStatus.DONE };
      const saved = makeTask({ status: TaskStatus.DONE });

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockResolvedValue(saved);

      const result = await service.update('task-uuid-1', dto);

      expect(result.status).toBe(TaskStatus.DONE);
    });

    it('lanza BadRequestException (400) al intentar editar cualquier campo de una tarea done', async () => {
      const task = makeTask({ status: TaskStatus.DONE });
      const dto: UpdateTaskDto = { title: 'Nuevo título' };

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(service.update('task-uuid-1', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });

    it('permite reabrir una tarea cancelled (no es terminal)', async () => {
      const task = makeTask({ status: TaskStatus.CANCELLED });
      const dto: UpdateTaskDto = { status: TaskStatus.TODO };
      const saved = makeTask({ status: TaskStatus.TODO });

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockResolvedValue(saved);

      const result = await service.update('task-uuid-1', dto);

      expect(result.status).toBe(TaskStatus.TODO);
    });

    it('estampa completedAt al transicionar todo -> done via update() (PATCH admin)', async () => {
      const task = makeTask({ status: TaskStatus.TODO, completedAt: null });
      const dto: UpdateTaskDto = { status: TaskStatus.DONE };

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockImplementation((t: Task) =>
        Promise.resolve(t),
      );

      const result = await service.update('task-uuid-1', dto);

      expect(result.status).toBe(TaskStatus.DONE);
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(mockTasksRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          completedAt: expect.any(Date) as Date,
        }),
      );
    });

    it('no estampa completedAt en transiciones que no llegan a done via update()', async () => {
      const task = makeTask({ status: TaskStatus.TODO, completedAt: null });
      const dto: UpdateTaskDto = { status: TaskStatus.IN_PROGRESS };

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockImplementation((t: Task) =>
        Promise.resolve(t),
      );

      const result = await service.update('task-uuid-1', dto);

      expect(result.status).toBe(TaskStatus.IN_PROGRESS);
      expect(result.completedAt).toBeNull();
    });

    it('lanza BadRequestException (400) cuando el nuevo assignee no pertenece al proyecto (solo assignee)', async () => {
      const task = makeTask({ projectId: 'proj-uuid-1', assigneeId: null });
      const dto: UpdateTaskDto = { assigneeId: 'outsider-id' };

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockProjectsRepository.findOne.mockResolvedValue(
        makeProject({
          id: 'proj-uuid-1',
          developers: [makeUser({ id: 'member-id' })],
        }),
      );

      await expect(service.update('task-uuid-1', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException (400) cuando cambia solo el proyecto y el assignee actual queda stale', async () => {
      const task = makeTask({
        projectId: 'proj-uuid-1',
        assigneeId: 'user-uuid-1',
      });
      const dto: UpdateTaskDto = { projectId: 'proj-uuid-2' };

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockProjectsRepository.findOne.mockResolvedValue(
        makeProject({
          id: 'proj-uuid-2',
          developers: [makeUser({ id: 'other-dev' })],
        }),
      );

      await expect(service.update('task-uuid-1', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockProjectsRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'proj-uuid-2' },
        relations: { developers: true },
      });
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });

    it('valida contra el nuevo proyecto cuando projectId y assigneeId cambian juntos y tiene éxito', async () => {
      const task = makeTask({
        projectId: 'proj-uuid-1',
        assigneeId: 'user-uuid-1',
      });
      const newDeveloper = makeUser({ id: 'dev-b' });
      const dto: UpdateTaskDto = {
        projectId: 'proj-uuid-2',
        assigneeId: 'dev-b',
      };
      const saved = makeTask({ projectId: 'proj-uuid-2', assigneeId: 'dev-b' });

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockProjectsRepository.findOne.mockResolvedValue(
        makeProject({ id: 'proj-uuid-2', developers: [newDeveloper] }),
      );
      mockTasksRepository.save.mockResolvedValue(saved);

      const result = await service.update('task-uuid-1', dto);

      expect(mockProjectsRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'proj-uuid-2' },
        relations: { developers: true },
      });
      expect(result.projectId).toBe('proj-uuid-2');
      expect(result.assigneeId).toBe('dev-b');
    });

    it('lanza BadRequestException (400) al intentar limpiar assigneeId en una tarea done', async () => {
      const task = makeTask({
        status: TaskStatus.DONE,
        assigneeId: 'user-uuid-1',
      });
      const dto = { assigneeId: null } as unknown as UpdateTaskDto;

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(service.update('task-uuid-1', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });

    it('no valida membresía cuando projectId y assigneeId no cambian en un update parcial', async () => {
      const task = makeTask({
        projectId: 'proj-uuid-1',
        assigneeId: 'user-uuid-1',
      });
      const dto: UpdateTaskDto = { title: 'Solo título' };
      const saved = makeTask({ title: 'Solo título' });

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockResolvedValue(saved);

      const result = await service.update('task-uuid-1', dto);

      expect(mockProjectsRepository.findOne).not.toHaveBeenCalled();
      expect(result.title).toBe('Solo título');
    });
  });

  // ── updateStatus ─────────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('actualiza el status correctamente cuando el usuario es el asignado', async () => {
      const dev = makeUser();
      const task = makeTask({ assigneeId: dev.id });
      const dto: UpdateStatusDto = { status: TaskStatus.IN_PROGRESS };
      const saved = makeTask({
        assigneeId: dev.id,
        status: TaskStatus.IN_PROGRESS,
      });

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockResolvedValue(saved);

      const result = await service.updateStatus('task-uuid-1', dto, dev);

      expect(result.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('lanza ForbiddenException (403) cuando el usuario no es el asignado', async () => {
      const dev = makeUser({ id: 'other-user' });
      const task = makeTask({ assigneeId: 'user-uuid-1' });
      const dto: UpdateStatusDto = { status: TaskStatus.DONE };

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(
        service.updateStatus('task-uuid-1', dto, dev),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza BadRequestException (400) cuando se intenta poner status CANCELLED', async () => {
      const dev = makeUser();
      const task = makeTask({ assigneeId: dev.id });
      const dto = {
        status: TaskStatus.CANCELLED,
      } as unknown as UpdateStatusDto;

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(
        service.updateStatus('task-uuid-1', dto, dev),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException (404) cuando la tarea no existe', async () => {
      mockTasksRepository.findOne.mockResolvedValue(null);
      const dev = makeUser();
      const dto: UpdateStatusDto = { status: TaskStatus.DONE };

      await expect(
        service.updateStatus('nonexistent', dto, dev),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException (400) al intentar reabrir una tarea done (done -> todo)', async () => {
      const dev = makeUser();
      const task = makeTask({ assigneeId: dev.id, status: TaskStatus.DONE });
      const dto: UpdateStatusDto = { status: TaskStatus.TODO };

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(
        service.updateStatus('task-uuid-1', dto, dev),
      ).rejects.toThrow(BadRequestException);
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException (400) al intentar reabrir una tarea done (done -> in_progress)', async () => {
      const dev = makeUser();
      const task = makeTask({ assigneeId: dev.id, status: TaskStatus.DONE });
      const dto: UpdateStatusDto = { status: TaskStatus.IN_PROGRESS };

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(
        service.updateStatus('task-uuid-1', dto, dev),
      ).rejects.toThrow(BadRequestException);
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });

    it('permite el no-op done -> done', async () => {
      const dev = makeUser();
      const task = makeTask({ assigneeId: dev.id, status: TaskStatus.DONE });
      const dto: UpdateStatusDto = { status: TaskStatus.DONE };
      const saved = makeTask({ assigneeId: dev.id, status: TaskStatus.DONE });

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockResolvedValue(saved);

      const result = await service.updateStatus('task-uuid-1', dto, dev);

      expect(result.status).toBe(TaskStatus.DONE);
    });

    it('lanza BadRequestException (400) al intentar cambiar el estado de una tarea cancelada', async () => {
      // El dev ve las canceladas en modo lectura; reabrirlas es decisión del
      // admin vía updateTask, nunca de este endpoint.
      const dev = makeUser();
      const task = makeTask({
        assigneeId: dev.id,
        status: TaskStatus.CANCELLED,
      });
      const dto: UpdateStatusDto = { status: TaskStatus.TODO };

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(
        service.updateStatus('task-uuid-1', dto, dev),
      ).rejects.toThrow(BadRequestException);
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });

    it('estampa completedAt al transicionar in_progress -> done', async () => {
      const dev = makeUser();
      const task = makeTask({
        assigneeId: dev.id,
        status: TaskStatus.IN_PROGRESS,
        completedAt: null,
      });
      const dto: UpdateStatusDto = { status: TaskStatus.DONE };

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockImplementation((t: Task) =>
        Promise.resolve(t),
      );

      const result = await service.updateStatus('task-uuid-1', dto, dev);

      expect(result.status).toBe(TaskStatus.DONE);
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(mockTasksRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          completedAt: expect.any(Date) as Date,
        }),
      );
    });

    it('no estampa completedAt en transiciones que no llegan a done', async () => {
      const dev = makeUser();
      const task = makeTask({
        assigneeId: dev.id,
        status: TaskStatus.TODO,
        completedAt: null,
      });
      const dto: UpdateStatusDto = { status: TaskStatus.IN_PROGRESS };

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockImplementation((t: Task) =>
        Promise.resolve(t),
      );

      const result = await service.updateStatus('task-uuid-1', dto, dev);

      expect(result.status).toBe(TaskStatus.IN_PROGRESS);
      expect(result.completedAt).toBeNull();
    });
  });

  // ── updateEstimate ────────────────────────────────────────────────────────────

  describe('updateEstimate', () => {
    it('actualiza estimatedHours cuando el usuario es el asignado', async () => {
      const dev = makeUser();
      const task = makeTask({ assigneeId: dev.id });
      const dto: UpdateEstimateDto = { estimatedHours: 8 };
      const saved = makeTask({ assigneeId: dev.id, estimatedHours: 8 });

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockResolvedValue(saved);

      const result = await service.updateEstimate('task-uuid-1', dto, dev);

      expect(result.estimatedHours).toBe(8);
    });

    it('lanza ForbiddenException (403) cuando el usuario no es el asignado', async () => {
      const dev = makeUser({ id: 'other-user' });
      const task = makeTask({ assigneeId: 'user-uuid-1' });
      const dto: UpdateEstimateDto = { estimatedHours: 4 };

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(
        service.updateEstimate('task-uuid-1', dto, dev),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza NotFoundException (404) cuando la tarea no existe', async () => {
      mockTasksRepository.findOne.mockResolvedValue(null);
      const dev = makeUser();

      await expect(
        service.updateEstimate('nonexistent', { estimatedHours: 4 }, dev),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException (400) al intentar actualizar la estimación de una tarea done', async () => {
      const dev = makeUser();
      const task = makeTask({ assigneeId: dev.id, status: TaskStatus.DONE });
      const dto: UpdateEstimateDto = { estimatedHours: 4 };

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(
        service.updateEstimate('task-uuid-1', dto, dev),
      ).rejects.toThrow(BadRequestException);
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException (400) al intentar actualizar la estimación de una tarea cancelled', async () => {
      const dev = makeUser();
      const task = makeTask({
        assigneeId: dev.id,
        status: TaskStatus.CANCELLED,
      });
      const dto: UpdateEstimateDto = { estimatedHours: 4 };

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(
        service.updateEstimate('task-uuid-1', dto, dev),
      ).rejects.toThrow(BadRequestException);
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });
  });

  // ── softCancel ────────────────────────────────────────────────────────────────

  describe('softCancel', () => {
    it('establece status CANCELLED sin eliminar la fila', async () => {
      const task = makeTask();
      const saved = makeTask({ status: TaskStatus.CANCELLED });

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockResolvedValue(saved);

      const result = await service.softCancel('task-uuid-1');

      expect(mockTasksRepository.save).toHaveBeenCalled();
      expect(result.status).toBe(TaskStatus.CANCELLED);
    });

    it('lanza NotFoundException (404) cuando la tarea no existe', async () => {
      mockTasksRepository.findOne.mockResolvedValue(null);

      await expect(service.softCancel('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza BadRequestException (400) al intentar cancelar una tarea done', async () => {
      const task = makeTask({ status: TaskStatus.DONE });

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(service.softCancel('task-uuid-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });
  });
});
