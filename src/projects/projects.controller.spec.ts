import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/users.entity';
import { AssignDevelopersDto } from './dto/assign-developers.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectStatus } from './projects.entity';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

// ── Helpers de fixture ─────────────────────────────────────────────────────────

function makeResponseDto(overrides: Partial<ProjectResponseDto> = {}): ProjectResponseDto {
  const dto = new ProjectResponseDto();
  dto.id = 'proj-uuid-1';
  dto.name = 'Test Project';
  dto.description = 'A description';
  dto.status = ProjectStatus.ACTIVE;
  dto.developers = [];
  dto.createdAt = new Date('2024-01-01');
  dto.updatedAt = new Date('2024-01-01');
  return Object.assign(dto, overrides);
}

// ── Mock del servicio ───────────────────────────────────────────────────────────

const mockProjectsService = {
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
  assignDevelopers: jest.fn(),
};

// ── Suite principal ────────────────────────────────────────────────────────────

describe('ProjectsController', () => {
  let controller: ProjectsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectsService, useValue: mockProjectsService },
        // Reemplaza RolesGuard para probar el controlador en aislamiento
        { provide: RolesGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ── GET /projects ───────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('llama a ProjectsService.findAll y devuelve el array', async () => {
      const dtos = [makeResponseDto(), makeResponseDto({ id: 'proj-uuid-2', name: 'Another' })];
      mockProjectsService.findAll.mockResolvedValue(dtos);

      const result = await controller.findAll();

      expect(mockProjectsService.findAll).toHaveBeenCalledTimes(1);
      expect(result).toBe(dtos);
    });
  });

  // ── POST /projects ──────────────────────────────────────────────────────────

  describe('create', () => {
    it('llama a ProjectsService.create con el DTO recibido', async () => {
      const dto: CreateProjectDto = { name: 'New Project', description: 'Desc' };
      const responseDto = makeResponseDto({ name: dto.name });
      mockProjectsService.create.mockResolvedValue(responseDto);

      const result = await controller.create(dto);

      expect(mockProjectsService.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(responseDto);
    });
  });

  // ── PATCH /projects/:id ─────────────────────────────────────────────────────

  describe('update', () => {
    it('llama a ProjectsService.update con id y DTO', async () => {
      const dto: UpdateProjectDto = { name: 'Updated Name' };
      const responseDto = makeResponseDto({ name: 'Updated Name' });
      mockProjectsService.update.mockResolvedValue(responseDto);

      const result = await controller.update('proj-uuid-1', dto);

      expect(mockProjectsService.update).toHaveBeenCalledWith('proj-uuid-1', dto);
      expect(result).toBe(responseDto);
    });

    it('propaga NotFoundException (404) cuando el proyecto no existe', async () => {
      mockProjectsService.update.mockRejectedValue(new NotFoundException('Project not found'));

      await expect(controller.update('nonexistent', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /projects/:id/deactivate ─────────────────────────────────────────

  describe('deactivate', () => {
    it('llama a ProjectsService.deactivate con el id', async () => {
      const responseDto = makeResponseDto({ status: ProjectStatus.INACTIVE });
      mockProjectsService.deactivate.mockResolvedValue(responseDto);

      const result = await controller.deactivate('proj-uuid-1');

      expect(mockProjectsService.deactivate).toHaveBeenCalledWith('proj-uuid-1');
      expect(result.status).toBe(ProjectStatus.INACTIVE);
    });

    it('propaga BadRequestException (400) cuando el proyecto ya está inactivo', async () => {
      mockProjectsService.deactivate.mockRejectedValue(
        new BadRequestException('Project is already inactive'),
      );

      await expect(controller.deactivate('proj-uuid-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── PUT /projects/:id/developers ────────────────────────────────────────────

  describe('assignDevelopers', () => {
    it('llama a ProjectsService.assignDevelopers con id y DTO', async () => {
      const dto: AssignDevelopersDto = { developerIds: ['user-uuid-1'] };
      const responseDto = makeResponseDto();
      mockProjectsService.assignDevelopers.mockResolvedValue(responseDto);

      const result = await controller.assignDevelopers('proj-uuid-1', dto);

      expect(mockProjectsService.assignDevelopers).toHaveBeenCalledWith('proj-uuid-1', dto);
      expect(result).toBe(responseDto);
    });

    it('propaga BadRequestException (400) cuando se asigna un usuario con rol incorrecto', async () => {
      mockProjectsService.assignDevelopers.mockRejectedValue(
        new BadRequestException('Los siguientes usuarios no son developers activos: admin-id'),
      );
      const dto: AssignDevelopersDto = { developerIds: ['admin-id'] };

      await expect(controller.assignDevelopers('proj-uuid-1', dto)).rejects.toThrow(BadRequestException);
    });
  });

  // ── Metadatos de guards ─────────────────────────────────────────────────────

  describe('RolesGuard metadata', () => {
    it('el controlador tiene @Roles(UserRole.ADMIN) en sus metadatos', () => {
      const roles: UserRole[] = Reflect.getMetadata('roles', ProjectsController);
      expect(roles).toContain(UserRole.ADMIN);
    });
  });
});
