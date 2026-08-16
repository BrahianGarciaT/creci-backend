import { ArrayNotEmpty, IsArray, IsEnum, IsUUID } from 'class-validator';
import { TaskStatus } from '../tasks.entity';

// Columnas reordenables desde el kanban del developer — done/cancelled son de
// solo lectura (terminales), igual que en UpdateStatusDto.
const REORDERABLE_STATUSES = [TaskStatus.TODO, TaskStatus.IN_PROGRESS] as const;
type ReorderableStatus = (typeof REORDERABLE_STATUSES)[number];

// DTO para persistir el nuevo orden visual de una columna del kanban tras un
// drag-and-drop. `taskIds` debe ser exactamente el mismo conjunto de IDs que
// ya existe en projectId+status, en el nuevo orden deseado (ver
// TasksService.reorderColumn — rechaza con 400 si el set no coincide).
export class ReorderColumnDto {
  @IsEnum(REORDERABLE_STATUSES)
  status: ReorderableStatus;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  taskIds: string[];
}
