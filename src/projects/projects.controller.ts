import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/users.entity';
import { AssignDevelopersDto } from './dto/assign-developers.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  // GET /projects/mine — devuelve los proyectos donde el usuario autenticado es developer (JWT-only)
  @Get('mine')
  findMine(@Req() req: Request): Promise<ProjectResponseDto[]> {
    const user = req.user as { id: string };
    return this.projectsService.findMine(user.id);
  }

  // GET /projects — lista todos los proyectos con sus developers (ADMIN)
  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll(): Promise<ProjectResponseDto[]> {
    return this.projectsService.findAll();
  }

  // POST /projects — crea un nuevo proyecto (ADMIN)
  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateProjectDto): Promise<ProjectResponseDto> {
    return this.projectsService.create(dto);
  }

  // PATCH /projects/:id — actualiza name y/o description de un proyecto (ADMIN)
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectResponseDto> {
    return this.projectsService.update(id, dto);
  }

  // PATCH /projects/:id/deactivate — desactiva un proyecto (ADMIN)
  @Patch(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  deactivate(@Param('id') id: string): Promise<ProjectResponseDto> {
    return this.projectsService.deactivate(id);
  }

  // PATCH /projects/:id/reactivate — reactiva un proyecto (ADMIN)
  @Patch(':id/reactivate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  reactivate(@Param('id') id: string): Promise<ProjectResponseDto> {
    return this.projectsService.reactivate(id);
  }

  // PUT /projects/:id/developers — reemplaza todos los developers del proyecto (ADMIN)
  @Put(':id/developers')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  assignDevelopers(
    @Param('id') id: string,
    @Body() dto: AssignDevelopersDto,
  ): Promise<ProjectResponseDto> {
    return this.projectsService.assignDevelopers(id, dto);
  }
}
