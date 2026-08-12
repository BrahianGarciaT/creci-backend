import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Project } from '../projects/projects.entity';
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
  } as User;
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
  } as Project;
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
  create: jest.fn(),
  save: jest.fn(),
};

const mockProjectsRepository = {
  findOne: jest.fn(),
};

const mockUsersRepository = {
  findOne: jest.fn(),
};

// ── Suite principal ────────────────────────────────────────────────────────────

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getRepositoryToken(Task), useValue: mockTasksRepository },
        { provide: getRepositoryToken(Project), useValue: mockProjectsRepository },
        { provide: getRepositoryToken(User), useValue: mockUsersRepository },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('persiste la tarea y devuelve TaskResponseDto', async () => {
      const admin = makeUser({ role: UserRole.ADMIN });
      const dto: CreateTaskDto = {
        title: 'Nueva tarea',
        priority: TaskPriority.HIGH,
        projectId: 'proj-uuid-1',
      };
      const task = makeTask({ title: 'Nueva tarea', priority: TaskPriority.HIGH });

      mockProjectsRepository.findOne.mockResolvedValue(makeProject());
      mockTasksRepository.create.mockReturnValue(task);
      mockTasksRepository.save.mockResolvedValue(task);

      const result = await service.create(dto, admin);

      expect(mockProjectsRepository.findOne).toHaveBeenCalledWith({
        where: { id: dto.projectId },
      });
      expect(mockTasksRepository.save).toHaveBeenCalled();
      expect(result.title).toBe('Nueva tarea');
      expect(result.status).toBe(TaskStatus.TODO);
    });

    it('lanza NotFoundException (404) cuando el proyecto no existe', async () => {
      const admin = makeUser({ role: UserRole.ADMIN });
      mockProjectsRepository.findOne.mockResolvedValue(null);

      const dto: CreateTaskDto = {
        title: 'Tarea',
        priority: TaskPriority.LOW,
        projectId: 'nonexistent',
      };

      await expect(service.create(dto, admin)).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException (404) cuando el assigneeId no existe', async () => {
      const admin = makeUser({ role: UserRole.ADMIN });
      mockProjectsRepository.findOne.mockResolvedValue(makeProject());
      mockUsersRepository.findOne.mockResolvedValue(null);

      const dto: CreateTaskDto = {
        title: 'Tarea',
        priority: TaskPriority.LOW,
        projectId: 'proj-uuid-1',
        assigneeId: 'nonexistent-user',
      };

      await expect(service.create(dto, admin)).rejects.toThrow(NotFoundException);
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('devuelve todas las tareas incluyendo canceladas', async () => {
      const tasks = [
        makeTask({ status: TaskStatus.DONE }),
        makeTask({ id: 'task-uuid-2', status: TaskStatus.CANCELLED }),
      ];
      mockTasksRepository.find.mockResolvedValue(tasks);

      const result = await service.findAll();

      expect(mockTasksRepository.find).toHaveBeenCalledWith({ where: {}, relations: { project: true, assignee: true } });
      expect(result).toHaveLength(2);
    });

    it('filtra por projectId cuando se provee', async () => {
      mockTasksRepository.find.mockResolvedValue([makeTask()]);

      await service.findAll('proj-uuid-1');

      expect(mockTasksRepository.find).toHaveBeenCalledWith({
        where: { projectId: 'proj-uuid-1' },
        relations: { project: true, assignee: true },
      });
    });
  });

  // ── findByProject ────────────────────────────────────────────────────────────

  describe('findByProject', () => {
    it('devuelve tareas no canceladas cuando el usuario es miembro', async () => {
      const dev = makeUser();
      const project = makeProject({ developers: [dev] });
      const tasks = [makeTask({ status: TaskStatus.IN_PROGRESS })];

      mockProjectsRepository.findOne.mockResolvedValue(project);
      mockTasksRepository.find.mockResolvedValue(tasks);

      const result = await service.findByProject('proj-uuid-1', dev);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('lanza ForbiddenException (403) cuando el usuario no es miembro del proyecto', async () => {
      const dev = makeUser({ id: 'outsider-id' });
      const project = makeProject({ developers: [makeUser({ id: 'member-id' })] });

      mockProjectsRepository.findOne.mockResolvedValue(project);

      await expect(service.findByProject('proj-uuid-1', dev)).rejects.toThrow(ForbiddenException);
    });

    it('lanza NotFoundException (404) cuando el proyecto no existe', async () => {
      mockProjectsRepository.findOne.mockResolvedValue(null);
      const dev = makeUser();

      await expect(service.findByProject('nonexistent', dev)).rejects.toThrow(NotFoundException);
    });

    it('excluye tareas canceladas de los resultados', async () => {
      const dev = makeUser();
      const project = makeProject({ developers: [dev] });
      // Solo devuelve tareas no canceladas (el where excluye CANCELLED)
      mockProjectsRepository.findOne.mockResolvedValue(project);
      mockTasksRepository.find.mockResolvedValue([makeTask({ status: TaskStatus.TODO })]);

      const result = await service.findByProject('proj-uuid-1', dev);

      // Verifica que la query incluyó la exclusión de CANCELLED
      expect(mockTasksRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ projectId: 'proj-uuid-1' }) }),
      );
      expect(result.every((t) => t.status !== TaskStatus.CANCELLED)).toBe(true);
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

      await expect(service.update('nonexistent', {})).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException (400) cuando intenta reabrir una tarea done', async () => {
      const task = makeTask({ status: TaskStatus.DONE });
      const dto: UpdateTaskDto = { status: TaskStatus.TODO as any };

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(service.update('task-uuid-1', dto)).rejects.toThrow(BadRequestException);
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });

    it('permite el no-op done -> done', async () => {
      const task = makeTask({ status: TaskStatus.DONE });
      const dto: UpdateTaskDto = { status: TaskStatus.DONE as any };
      const saved = makeTask({ status: TaskStatus.DONE });

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockResolvedValue(saved);

      const result = await service.update('task-uuid-1', dto);

      expect(result.status).toBe(TaskStatus.DONE);
    });

    it('permite editar campos no relacionados con status en una tarea done', async () => {
      const task = makeTask({ status: TaskStatus.DONE });
      const dto: UpdateTaskDto = { title: 'Nuevo título' };
      const saved = makeTask({ status: TaskStatus.DONE, title: 'Nuevo título' });

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockResolvedValue(saved);

      const result = await service.update('task-uuid-1', dto);

      expect(result.title).toBe('Nuevo título');
      expect(result.status).toBe(TaskStatus.DONE);
    });

    it('permite reabrir una tarea cancelled (no es terminal)', async () => {
      const task = makeTask({ status: TaskStatus.CANCELLED });
      const dto: UpdateTaskDto = { status: TaskStatus.TODO as any };
      const saved = makeTask({ status: TaskStatus.TODO });

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockResolvedValue(saved);

      const result = await service.update('task-uuid-1', dto);

      expect(result.status).toBe(TaskStatus.TODO);
    });
  });

  // ── updateStatus ─────────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('actualiza el status correctamente cuando el usuario es el asignado', async () => {
      const dev = makeUser();
      const task = makeTask({ assigneeId: dev.id });
      const dto: UpdateStatusDto = { status: TaskStatus.IN_PROGRESS as any };
      const saved = makeTask({ assigneeId: dev.id, status: TaskStatus.IN_PROGRESS });

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockResolvedValue(saved);

      const result = await service.updateStatus('task-uuid-1', dto, dev);

      expect(result.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('lanza ForbiddenException (403) cuando el usuario no es el asignado', async () => {
      const dev = makeUser({ id: 'other-user' });
      const task = makeTask({ assigneeId: 'user-uuid-1' });
      const dto: UpdateStatusDto = { status: TaskStatus.DONE as any };

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(service.updateStatus('task-uuid-1', dto, dev)).rejects.toThrow(ForbiddenException);
    });

    it('lanza BadRequestException (400) cuando se intenta poner status CANCELLED', async () => {
      const dev = makeUser();
      const task = makeTask({ assigneeId: dev.id });
      const dto = { status: TaskStatus.CANCELLED } as unknown as UpdateStatusDto;

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(service.updateStatus('task-uuid-1', dto, dev)).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException (404) cuando la tarea no existe', async () => {
      mockTasksRepository.findOne.mockResolvedValue(null);
      const dev = makeUser();
      const dto: UpdateStatusDto = { status: TaskStatus.DONE as any };

      await expect(service.updateStatus('nonexistent', dto, dev)).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException (400) al intentar reabrir una tarea done (done -> todo)', async () => {
      const dev = makeUser();
      const task = makeTask({ assigneeId: dev.id, status: TaskStatus.DONE });
      const dto: UpdateStatusDto = { status: TaskStatus.TODO as any };

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(service.updateStatus('task-uuid-1', dto, dev)).rejects.toThrow(BadRequestException);
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException (400) al intentar reabrir una tarea done (done -> in_progress)', async () => {
      const dev = makeUser();
      const task = makeTask({ assigneeId: dev.id, status: TaskStatus.DONE });
      const dto: UpdateStatusDto = { status: TaskStatus.IN_PROGRESS as any };

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(service.updateStatus('task-uuid-1', dto, dev)).rejects.toThrow(BadRequestException);
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });

    it('permite el no-op done -> done', async () => {
      const dev = makeUser();
      const task = makeTask({ assigneeId: dev.id, status: TaskStatus.DONE });
      const dto: UpdateStatusDto = { status: TaskStatus.DONE as any };
      const saved = makeTask({ assigneeId: dev.id, status: TaskStatus.DONE });

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockResolvedValue(saved);

      const result = await service.updateStatus('task-uuid-1', dto, dev);

      expect(result.status).toBe(TaskStatus.DONE);
    });

    it('permite transiciones libres desde cancelled (no es terminal)', async () => {
      const dev = makeUser();
      const task = makeTask({ assigneeId: dev.id, status: TaskStatus.CANCELLED });
      const dto: UpdateStatusDto = { status: TaskStatus.TODO as any };
      const saved = makeTask({ assigneeId: dev.id, status: TaskStatus.TODO });

      mockTasksRepository.findOne.mockResolvedValue(task);
      mockTasksRepository.save.mockResolvedValue(saved);

      const result = await service.updateStatus('task-uuid-1', dto, dev);

      expect(result.status).toBe(TaskStatus.TODO);
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

      await expect(service.updateEstimate('task-uuid-1', dto, dev)).rejects.toThrow(ForbiddenException);
    });

    it('lanza NotFoundException (404) cuando la tarea no existe', async () => {
      mockTasksRepository.findOne.mockResolvedValue(null);
      const dev = makeUser();

      await expect(service.updateEstimate('nonexistent', { estimatedHours: 4 }, dev)).rejects.toThrow(
        NotFoundException,
      );
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

      await expect(service.softCancel('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException (400) al intentar cancelar una tarea done', async () => {
      const task = makeTask({ status: TaskStatus.DONE });

      mockTasksRepository.findOne.mockResolvedValue(task);

      await expect(service.softCancel('task-uuid-1')).rejects.toThrow(BadRequestException);
      expect(mockTasksRepository.save).not.toHaveBeenCalled();
    });
  });
});
