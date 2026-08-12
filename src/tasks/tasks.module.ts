import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../projects/projects.entity';
import { ProjectsModule } from '../projects/projects.module';
import { User } from '../users/users.entity';
import { Task } from './tasks.entity';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    // Registra Task, Project y User para inyectar los tres repositorios en TasksService
    TypeOrmModule.forFeature([Task, Project, User]),
    // Provee ProjectAccessService, usado por TasksService.findByProject
    ProjectsModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
