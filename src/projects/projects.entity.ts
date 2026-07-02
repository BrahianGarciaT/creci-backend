import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/users.entity';

// Estado del proyecto; los proyectos inactivos se conservan (soft-deactivate)
export enum ProjectStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Nombre del proyecto; requerido y único dentro del sistema
  @Column()
  name: string;

  // Descripción opcional del proyecto
  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Column({
    type: 'enum',
    enum: ProjectStatus,
    default: ProjectStatus.ACTIVE,
  })
  status: ProjectStatus;

  // Relación ManyToMany con usuarios de rol developer; Project es el dueño de la tabla join
  @ManyToMany(() => User, (user) => user.projects)
  @JoinTable({
    name: 'project_developers',
    joinColumn: { name: 'project_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  developers: User[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
