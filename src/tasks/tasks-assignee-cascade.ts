import { EntityManager, In, Not } from 'typeorm';
import {
  TaskMovement,
  TaskMovementActorKind,
  TaskMovementKind,
} from './task-movement.entity';
import { Task, TaskStatus } from './tasks.entity';

// Limpia assigneeId en tareas no-done de los proyectos indicados, para los usuarios
// removidos indicados, y registra una fila de auditoría (actorKind: 'system')
// por cada tarea efectivamente desasignada. Primitiva compartida por
// ProjectsService.assignDevelopers() y UsersService (cambio de rol fuera de
// developer / desactivación). Debe llamarse siempre dentro de la misma
// transacción que el cambio de membresía/rol.
export async function clearAssigneeForRemovedDevelopers(
  manager: EntityManager,
  projectIds: string[],
  removedUserIds: string[],
): Promise<void> {
  if (projectIds.length === 0 || removedUserIds.length === 0) return;

  const criteria = {
    projectId: In(projectIds),
    assigneeId: In(removedUserIds),
    status: Not(TaskStatus.DONE),
  };

  // Se seleccionan ANTES del update: el update masivo no devuelve las filas
  // afectadas y el criterio deja de matchear una vez que assigneeId es null.
  const affected = await manager.find(Task, {
    where: criteria,
    select: { id: true, projectId: true, assigneeId: true },
  });
  if (affected.length === 0) return;

  await manager.update(Task, criteria, { assigneeId: null });

  await manager.insert(
    TaskMovement,
    affected.map((task) => ({
      taskId: task.id,
      projectId: task.projectId,
      actorKind: TaskMovementActorKind.SYSTEM,
      actorUserId: null,
      kind: TaskMovementKind.ASSIGNEE_CHANGE,
      previousValue: task.assigneeId,
      newValue: null,
    })),
  );
}
