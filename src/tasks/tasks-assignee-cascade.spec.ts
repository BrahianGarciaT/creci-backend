import { In, Not } from 'typeorm';
import { Task, TaskStatus } from './tasks.entity';
import { clearAssigneeForRemovedDevelopers } from './tasks-assignee-cascade';

describe('clearAssigneeForRemovedDevelopers', () => {
  it('limpia el assigneeId de tareas no-done de los proyectos/usuarios indicados', async () => {
    const mockManager = { update: jest.fn().mockResolvedValue(undefined) };

    await clearAssigneeForRemovedDevelopers(mockManager as any, ['proj-1'], ['user-1']);

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
    const mockManager = { update: jest.fn().mockResolvedValue(undefined) };

    await clearAssigneeForRemovedDevelopers(mockManager as any, ['proj-1'], ['user-1']);

    const [, criteria] = mockManager.update.mock.calls[0];
    expect(criteria.status).toEqual(Not(TaskStatus.DONE));
  });

  it('es un no-op cuando projectIds está vacío', async () => {
    const mockManager = { update: jest.fn() };

    await clearAssigneeForRemovedDevelopers(mockManager as any, [], ['user-1']);

    expect(mockManager.update).not.toHaveBeenCalled();
  });

  it('es un no-op cuando removedUserIds está vacío', async () => {
    const mockManager = { update: jest.fn() };

    await clearAssigneeForRemovedDevelopers(mockManager as any, ['proj-1'], []);

    expect(mockManager.update).not.toHaveBeenCalled();
  });
});
