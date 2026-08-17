import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../projects/projects.entity';
import { ProjectsModule } from '../projects/projects.module';
import { User } from '../users/users.entity';
import { TaskMovement } from './task-movement.entity';
import { Task } from './tasks.entity';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    // Registra Task, TaskMovement, Project y User. TaskMovement no se inyecta
    // como repositorio propio (los inserts van por el manager transaccional),
    // pero se registra igual para que TypeORM la reconozca en el DataSource.
    TypeOrmModule.forFeature([Task, TaskMovement, Project, User]),
    // Provee ProjectAccessService, usado por TasksService.findByProject
    ProjectsModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
