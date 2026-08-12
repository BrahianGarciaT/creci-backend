import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../projects/projects.entity';
import { ProjectsModule } from '../projects/projects.module';
import { Task } from '../tasks/tasks.entity';
import { User } from '../users/users.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    // Registra Task, Project y User para inyectar los tres repositorios en DashboardService
    TypeOrmModule.forFeature([Task, Project, User]),
    // Provee ProjectAccessService (usado por el endpoint de detalle en PR3)
    ProjectsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
