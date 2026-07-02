import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from '../projects/projects.entity';
import { User } from '../users/users.entity';

// Estado de la tarea; CANCELLED actúa como soft-delete (la fila se conserva)
export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
  CANCELLED = 'cancelled',
}

// Prioridad de la tarea; usada para ordenar y filtrar en el frontend
export enum TaskPriority {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Título de la tarea; requerido y no vacío
  @Column()
  title: string;

  // Descripción opcional de la tarea
  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.TODO,
  })
  status: TaskStatus;

  @Column({
    type: 'enum',
    enum: TaskPriority,
  })
  priority: TaskPriority;

  // Fecha límite opcional
  @Column({ name: 'due_date', nullable: true, type: 'timestamptz' })
  dueDate: Date | null;

  // Estimación de horas; TypeORM devuelve string desde columna numeric → coercionar en DTO
  @Column({ name: 'estimated_hours', nullable: true, type: 'numeric' })
  estimatedHours: number | null;

  // Relación con el proyecto; al borrar el proyecto las tareas se eliminan en cascada
  @ManyToOne(() => Project, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'project_id' })
  projectId: string;

  // Asignado opcional; si el usuario se elimina la relación queda en null
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assignee_id' })
  assignee: User | null;

  @Column({ name: 'assignee_id', nullable: true })
  assigneeId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
