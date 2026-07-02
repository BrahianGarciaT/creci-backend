import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { User } from '../users/users.entity';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Project } from './projects.entity';

@Module({
  imports: [
    // Registra tanto Project como User para poder inyectar ambos repositorios en ProjectsService
    TypeOrmModule.forFeature([Project, User]),
    UsersModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
