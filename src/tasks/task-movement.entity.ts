import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Task } from './tasks.entity';
import { User } from '../users/users.entity';

// Discriminador de "qué campo cambió". El par previousValue/newValue se
// codifica genéricamente como texto según el contrato definido en el design
// doc (status/estimatedHours/dueDate/assigneeId como literal string, ISO-8601
// UTC, o decimal string respectivamente).
export enum TaskMovementKind {
  STATUS_CHANGE = 'status_change',
  CANCELLED = 'cancelled',
  ESTIMATE_CHANGE = 'estimate_change',
  DUE_DATE_CHANGE = 'due_date_change',
  ASSIGNEE_CHANGE = 'assignee_change',
}

// Quien causó el cambio. `system` cubre las cascadas automáticas que no tienen
// un actor humano directo (remoción de developer del proyecto, cambio de rol,
// desactivación): la acción humana fue otra, no "desasignar esta tarea".
export enum TaskMovementActorKind {
  USER = 'user',
  SYSTEM = 'system',
}

@Entity('task_movements')
@Index(['taskId', 'createdAt'])
export class TaskMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Task, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'task_id' })
  task: Task;

  @Column({ name: 'task_id' })
  @Index()
  taskId: string;

  @Column({ name: 'project_id' })
  @Index()
  projectId: string;

  // Nullable por dos motivos distintos: actorKind='system' (nunca hubo
  // usuario) y onDelete SET NULL (el usuario existió pero su fila se borró).
  // Por eso el null NO alcanza para inferir "system" — ese dato vive en
  // actorKind.
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actor: User | null;

  @Column({ name: 'actor_user_id', nullable: true })
  actorUserId: string | null;

  @Column({
    name: 'actor_kind',
    type: 'enum',
    enum: TaskMovementActorKind,
    default: TaskMovementActorKind.USER,
  })
  actorKind: TaskMovementActorKind;

  @Column({ type: 'enum', enum: TaskMovementKind })
  kind: TaskMovementKind;

  // Valor previo / nuevo del campo auditado, serializado como texto según el
  // contrato de codificación por `kind`. Null es significativo (campo vaciado).
  @Column({ name: 'previous_value', type: 'text', nullable: true })
  previousValue: string | null;

  @Column({ name: 'new_value', type: 'text', nullable: true })
  newValue: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
