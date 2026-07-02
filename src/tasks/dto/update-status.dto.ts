import { IsEnum } from 'class-validator';
import { TaskStatus } from '../tasks.entity';

// Valores de status permitidos para el developer; CANCELLED está excluido (es acción de admin)
const ALLOWED_STATUSES = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

// DTO para que un developer actualice el status de su propia tarea
// No acepta CANCELLED — la cancelación es exclusiva del admin via DELETE /tasks/:id
export class UpdateStatusDto {
  @IsEnum(ALLOWED_STATUSES)
  status: AllowedStatus;
}
