import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { validate } from './config/env.validation';
import { DashboardModule } from './dashboard/dashboard.module';
import { Project } from './projects/projects.entity';
import { ProjectsModule } from './projects/projects.module';
import { TaskMovement } from './tasks/task-movement.entity';
import { Task } from './tasks/tasks.entity';
import { TasksModule } from './tasks/tasks.module';
import { User } from './users/users.entity';
import { UsersModule } from './users/users.module';
import { LoggerModule } from './logger/logger.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    LoggerModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.getOrThrow<string>('DB_HOST'),
        port: config.getOrThrow<number>('DB_PORT'),
        username: config.getOrThrow<string>('DB_USER'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_NAME'),
        // TaskMovement debe estar aquí: con synchronize: true, la tabla
        // task_movements solo se crea si la entidad figura en este array.
        entities: [User, Project, Task, TaskMovement],
        synchronize: true,
      }),
    }),
    UsersModule,
    AuthModule,
    ProjectsModule,
    TasksModule,
    DashboardModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
