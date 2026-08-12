import { EntityManager, In, Not } from 'typeorm';
import { Task, TaskStatus } from './tasks.entity';

// Limpia assigneeId en tareas no-done de los proyectos indicados, para los usuarios
// removidos indicados. Primitiva compartida por ProjectsService.assignDevelopers()
// y UsersService (cambio de rol fuera de developer / desactivación). Debe llamarse
// siempre dentro de la misma transacción que el cambio de membresía/rol.
export async function clearAssigneeForRemovedDevelopers(
  manager: EntityManager,
  projectIds: string[],
  removedUserIds: string[],
): Promise<void> {
  if (projectIds.length === 0 || removedUserIds.length === 0) return;

  await manager.update(
    Task,
    {
      projectId: In(projectIds),
      assigneeId: In(removedUserIds),
      status: Not(TaskStatus.DONE),
    },
    { assigneeId: null },
  );
}
