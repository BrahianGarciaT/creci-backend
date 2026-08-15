import { EntityManager, FindOptionsWhere, In, Not } from 'typeorm';
import { Task, TaskStatus } from './tasks.entity';
import { clearAssigneeForRemovedDevelopers } from './tasks-assignee-cascade';

// Mock tipado como Partial<EntityManager>: solo se usa `update` (lo único que
// clearAssigneeForRemovedDevelopers llama), pero conserva la firma real del
// método para que las aserciones sobre sus argumentos queden tipadas.
type MockManager = { update: jest.Mock };

function makeMockManager(): MockManager {
  return { update: jest.fn().mockResolvedValue(undefined) };
}

describe('clearAssigneeForRemovedDevelopers', () => {
  it('limpia el assigneeId de tareas no-done de los proyectos/usuarios indicados', async () => {
    const mockManager = makeMockManager();

    await clearAssigneeForRemovedDevelopers(
      mockManager as unknown as EntityManager,
      ['proj-1'],
      ['user-1'],
    );

    expect(mockManager.update).toHaveBeenCalledWith(
      Task,
      {
        projectId: In(['proj-1']),
        assigneeId: In(['user-1']),
        status: Not(TaskStatus.DONE),
      },
      { assigneeId: null },
    );
  });

  it('excluye tareas done del criterio de actualización (assertion de seguridad)', async () => {
    const mockManager = makeMockManager();

    await clearAssigneeForRemovedDevelopers(
      mockManager as unknown as EntityManager,
      ['proj-1'],
      ['user-1'],
    );

    const [, criteria] = mockManager.update.mock.calls[0] as [
      typeof Task,
      FindOptionsWhere<Task>,
      unknown,
    ];
    expect(criteria.status).toEqual(Not(TaskStatus.DONE));
  });

  it('es un no-op cuando projectIds está vacío', async () => {
    const mockManager = makeMockManager();

    await clearAssigneeForRemovedDevelopers(
      mockManager as unknown as EntityManager,
      [],
      ['user-1'],
    );

    expect(mockManager.update).not.toHaveBeenCalled();
  });

  it('es un no-op cuando removedUserIds está vacío', async () => {
    const mockManager = makeMockManager();

    await clearAssigneeForRemovedDevelopers(
      mockManager as unknown as EntityManager,
      ['proj-1'],
      [],
    );

    expect(mockManager.update).not.toHaveBeenCalled();
  });
});
