import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/users.entity';
import { AssignDevelopersDto } from './dto/assign-developers.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

// Todos los endpoints de este controlador requieren un JWT válido con rol ADMIN
@Controller('projects')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  // GET /projects — lista todos los proyectos con sus developers
  @Get()
  findAll(): Promise<ProjectResponseDto[]> {
    return this.projectsService.findAll();
  }

  // POST /projects — crea un nuevo proyecto
  @Post()
  create(@Body() dto: CreateProjectDto): Promise<ProjectResponseDto> {
    return this.projectsService.create(dto);
  }

  // PATCH /projects/:id — actualiza name y/o description de un proyecto
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectResponseDto> {
    return this.projectsService.update(id, dto);
  }

  // PATCH /projects/:id/deactivate — desactiva un proyecto (soft-deactivate)
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string): Promise<ProjectResponseDto> {
    return this.projectsService.deactivate(id);
  }

  // PATCH /projects/:id/reactivate — reactiva un proyecto previamente desactivado
  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string): Promise<ProjectResponseDto> {
    return this.projectsService.reactivate(id);
  }

  // PUT /projects/:id/developers — reemplaza todos los developers del proyecto
  @Put(':id/developers')
  assignDevelopers(
    @Param('id') id: string,
    @Body() dto: AssignDevelopersDto,
  ): Promise<ProjectResponseDto> {
    return this.projectsService.assignDevelopers(id, dto);
  }
}
