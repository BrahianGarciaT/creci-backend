import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '../auth/roles.guard';
import { User, UserRole } from '../users/users.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateEstimateDto } from './dto/update-estimate.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { TaskPriority, TaskStatus } from './tasks.entity';
import { TasksController } from './tasks.controller';
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
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeResponseDto(
  overrides: Partial<TaskResponseDto> = {},
): TaskResponseDto {
  const dto = new TaskResponseDto();
  dto.id = 'task-uuid-1';
  dto.title = 'Test Task';
  dto.description = null;
  dto.status = TaskStatus.TODO;
  dto.priority = TaskPriority.MEDIUM;
  dto.dueDate = null;
  dto.estimatedHours = null;
  dto.projectId = 'proj-uuid-1';
  dto.assigneeId = null;
  dto.createdAt = new Date('2024-01-01');
  dto.updatedAt = new Date('2024-01-01');
  return Object.assign(dto, overrides);
}

// ── Mock del servicio ───────────────────────────────────────────────────────────

const mockTasksService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findByProject: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  updateEstimate: jest.fn(),
  softCancel: jest.fn(),
};

// ── Suite principal ────────────────────────────────────────────────────────────

describe('TasksController', () => {
  let controller: TasksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: mockTasksService },
        { provide: RolesGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TasksController>(TasksController);
  });

  afterEach(() => jest.clearAllMocks());

  // ── POST /tasks ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('llama a TasksService.create con el DTO', async () => {
      const dto: CreateTaskDto = {
        title: 'Nueva',
        priority: TaskPriority.HIGH,
        projectId: 'proj-uuid-1',
      };
      const responseDto = makeResponseDto({ title: 'Nueva' });

      mockTasksService.create.mockResolvedValue(responseDto);

      const result = await controller.create(dto);

      expect(mockTasksService.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(responseDto);
    });
  });

  // ── GET /tasks ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('llama a TasksService.findAll con la query de paginación y devuelve el envelope', async () => {
      const dtos = [makeResponseDto()];
      const paginated = {
        data: dtos,
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      mockTasksService.findAll.mockResolvedValue(paginated);

      const result = await controller.findAll({});

      expect(mockTasksService.findAll).toHaveBeenCalledWith({});
      expect(result).toBe(paginated);
    });

    it('pasa projectId a TasksService.findAll cuando se provee como query param', async () => {
      mockTasksService.findAll.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      });

      await controller.findAll({ projectId: 'proj-uuid-1' });

      expect(mockTasksService.findAll).toHaveBeenCalledWith({
        projectId: 'proj-uuid-1',
      });
    });
  });

  // ── GET /tasks/project/:projectId ────────────────────────────────────────────

  describe('findByProject', () => {
    it('llama a TasksService.findByProject con projectId, el usuario actual y la query de paginación', async () => {
      const dev = makeUser();
      const dtos = [makeResponseDto({ status: TaskStatus.IN_PROGRESS })];
      const paginated = {
        data: dtos,
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      mockTasksService.findByProject.mockResolvedValue(paginated);

      const result = await controller.findByProject('proj-uuid-1', dev, {});

      expect(mockTasksService.findByProject).toHaveBeenCalledWith(
        'proj-uuid-1',
        dev,
        {},
      );
      expect(result).toBe(paginated);
    });

    it('propaga ForbiddenException cuando el servicio la lanza', async () => {
      const dev = makeUser({ id: 'outsider' });
      mockTasksService.findByProject.mockRejectedValue(
        new ForbiddenException('You are not a member of this project'),
      );

      await expect(
        controller.findByProject('proj-uuid-1', dev, {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── PATCH /tasks/:id ─────────────────────────────────────────────────────────

  describe('update', () => {
    it('llama a TasksService.update con id y DTO', async () => {
      const dto: UpdateTaskDto = { title: 'Actualizada' };
      const responseDto = makeResponseDto({ title: 'Actualizada' });
      mockTasksService.update.mockResolvedValue(responseDto);

      const result = await controller.update('task-uuid-1', dto);

      expect(mockTasksService.update).toHaveBeenCalledWith('task-uuid-1', dto);
      expect(result).toBe(responseDto);
    });

    it('propaga NotFoundException (404) cuando la tarea no existe', async () => {
      mockTasksService.update.mockRejectedValue(
        new NotFoundException('Task not found'),
      );

      await expect(controller.update('nonexistent', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('propaga BadRequestException (400) cuando el servicio rechaza reabrir una tarea done', async () => {
      const dto: UpdateTaskDto = { status: TaskStatus.TODO };
      mockTasksService.update.mockRejectedValue(
        new BadRequestException(
          'A completed task cannot change status. Create a new task instead.',
        ),
      );

      await expect(controller.update('task-uuid-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── PATCH /tasks/:id/status ──────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('llama a TasksService.updateStatus con id, dto y el usuario actual', async () => {
      const dev = makeUser();
      const dto: UpdateStatusDto = { status: TaskStatus.DONE };
      const responseDto = makeResponseDto({
        status: TaskStatus.DONE,
        assigneeId: dev.id,
      });
      mockTasksService.updateStatus.mockResolvedValue(responseDto);

      const result = await controller.updateStatus('task-uuid-1', dto, dev);

      expect(mockTasksService.updateStatus).toHaveBeenCalledWith(
        'task-uuid-1',
        dto,
        dev,
      );
      expect(result.status).toBe(TaskStatus.DONE);
    });

    it('propaga ForbiddenException cuando el usuario no es el asignado', async () => {
      const dev = makeUser({ id: 'other' });
      const dto: UpdateStatusDto = { status: TaskStatus.IN_PROGRESS };
      mockTasksService.updateStatus.mockRejectedValue(
        new ForbiddenException('You are not the assignee of this task'),
      );

      await expect(
        controller.updateStatus('task-uuid-1', dto, dev),
      ).rejects.toThrow(ForbiddenException);
    });

    it('propaga BadRequestException (400) cuando el servicio rechaza reabrir una tarea done', async () => {
      const dev = makeUser();
      const dto: UpdateStatusDto = { status: TaskStatus.TODO };
      mockTasksService.updateStatus.mockRejectedValue(
        new BadRequestException(
          'A completed task cannot change status. Create a new task instead.',
        ),
      );

      await expect(
        controller.updateStatus('task-uuid-1', dto, dev),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── PATCH /tasks/:id/estimate ────────────────────────────────────────────────

  describe('updateEstimate', () => {
    it('llama a TasksService.updateEstimate con id, dto y el usuario actual', async () => {
      const dev = makeUser();
      const dto: UpdateEstimateDto = { estimatedHours: 4 };
      const responseDto = makeResponseDto({
        estimatedHours: 4,
        assigneeId: dev.id,
      });
      mockTasksService.updateEstimate.mockResolvedValue(responseDto);

      const result = await controller.updateEstimate('task-uuid-1', dto, dev);

      expect(mockTasksService.updateEstimate).toHaveBeenCalledWith(
        'task-uuid-1',
        dto,
        dev,
      );
      expect(result.estimatedHours).toBe(4);
    });

    it('propaga ForbiddenException cuando el usuario no es el asignado', async () => {
      const dev = makeUser({ id: 'other' });
      const dto: UpdateEstimateDto = { estimatedHours: 2 };
      mockTasksService.updateEstimate.mockRejectedValue(
        new ForbiddenException('You are not the assignee of this task'),
      );

      await expect(
        controller.updateEstimate('task-uuid-1', dto, dev),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── DELETE /tasks/:id ────────────────────────────────────────────────────────

  describe('softCancel', () => {
    it('llama a TasksService.softCancel con el id', async () => {
      const responseDto = makeResponseDto({ status: TaskStatus.CANCELLED });
      mockTasksService.softCancel.mockResolvedValue(responseDto);

      const result = await controller.softCancel('task-uuid-1');

      expect(mockTasksService.softCancel).toHaveBeenCalledWith('task-uuid-1');
      expect(result.status).toBe(TaskStatus.CANCELLED);
    });

    it('propaga NotFoundException (404) cuando la tarea no existe', async () => {
      mockTasksService.softCancel.mockRejectedValue(
        new NotFoundException('Task not found'),
      );

      await expect(controller.softCancel('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('propaga BadRequestException (400) cuando el servicio rechaza cancelar una tarea done', async () => {
      mockTasksService.softCancel.mockRejectedValue(
        new BadRequestException(
          'A completed task cannot change status. Create a new task instead.',
        ),
      );

      await expect(controller.softCancel('task-uuid-1')).rejects.toThrow(
        BadRequestException,
      );
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
    methodName: keyof TasksController,
  ): UserRole[] | undefined {
    const proto = controller as unknown as Record<string, object>;
    return Reflect.getMetadata('roles', proto[methodName]) as
      | UserRole[]
      | undefined;
  }

  describe('RolesGuard metadata', () => {
    it('el handler create tiene @Roles(UserRole.ADMIN)', () => {
      const roles = getRolesMetadata('create');
      expect(roles).toContain(UserRole.ADMIN);
    });

    it('el handler findAll tiene @Roles(UserRole.ADMIN)', () => {
      const roles = getRolesMetadata('findAll');
      expect(roles).toContain(UserRole.ADMIN);
    });

    it('el handler findByProject no tiene @Roles (JWT-only)', () => {
      const roles = getRolesMetadata('findByProject');
      expect(roles).toBeUndefined();
    });

    it('el handler update tiene @Roles(UserRole.ADMIN)', () => {
      const roles = getRolesMetadata('update');
      expect(roles).toContain(UserRole.ADMIN);
    });

    it('el handler updateStatus no tiene @Roles (JWT-only)', () => {
      const roles = getRolesMetadata('updateStatus');
      expect(roles).toBeUndefined();
    });

    it('el handler updateEstimate no tiene @Roles (JWT-only)', () => {
      const roles = getRolesMetadata('updateEstimate');
      expect(roles).toBeUndefined();
    });

    it('el handler softCancel tiene @Roles(UserRole.ADMIN)', () => {
      const roles = getRolesMetadata('softCancel');
      expect(roles).toContain(UserRole.ADMIN);
    });
  });
});
