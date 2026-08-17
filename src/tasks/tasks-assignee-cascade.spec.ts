import { EntityManager, FindOptionsWhere, In, Not } from 'typeorm';
import {
  TaskMovement,
  TaskMovementActorKind,
  TaskMovementKind,
} from './task-movement.entity';
import { Task, TaskStatus } from './tasks.entity';
import { clearAssigneeForRemovedDevelopers } from './tasks-assignee-cascade';

// Mock tipado como Partial<EntityManager>: find/update/insert son los únicos
// métodos que clearAssigneeForRemovedDevelopers llama (select-then-update +
// insert de auditoría), pero conservan la firma real para que las
// aserciones sobre argumentos queden tipadas.
type MockManager = { find: jest.Mock; update: jest.Mock; insert: jest.Mock };

function makeMockManager(): MockManager {
  return {
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn().mockResolvedValue(undefined),
  };
}

describe('clearAssigneeForRemovedDevelopers', () => {
  it('limpia el assigneeId de tareas no-done de los proyectos/usuarios indicados', async () => {
    const mockManager = makeMockManager();
    mockManager.find.mockResolvedValue([
      { id: 'task-1', projectId: 'proj-1', assigneeId: 'user-1' },
    ]);

    await clearAssigneeForRemovedDevelopers(
      mockManager as unknown as EntityManager,
      ['proj-1'],
      ['user-1'],
    );

    expect(mockManager.find).toHaveBeenCalledWith(Task, {
      where: {
        projectId: In(['proj-1']),
        assigneeId: In(['user-1']),
        status: Not(TaskStatus.DONE),
      },
      select: { id: true, projectId: true, assigneeId: true },
    });
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

  it('find precede al update (select-then-update, no bulk update ciego)', async () => {
    const mockManager = makeMockManager();
    const callOrder: string[] = [];
    mockManager.find.mockImplementation(() => {
      callOrder.push('find');
      return Promise.resolve([
        { id: 'task-1', projectId: 'proj-1', assigneeId: 'user-1' },
      ]);
    });
    mockManager.update.mockImplementation(() => {
      callOrder.push('update');
      return Promise.resolve(undefined);
    });

    await clearAssigneeForRemovedDevelopers(
      mockManager as unknown as EntityManager,
      ['proj-1'],
      ['user-1'],
    );

    expect(callOrder).toEqual(['find', 'update']);
  });

  it('excluye tareas done del criterio (assertion de seguridad)', async () => {
    const mockManager = makeMockManager();
    mockManager.find.mockResolvedValue([
      { id: 'task-1', projectId: 'proj-1', assigneeId: 'user-1' },
    ]);

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

  it('inserta una fila de auditoría por cada tarea efectivamente desasignada, con actorKind system', async () => {
    const mockManager = makeMockManager();
    mockManager.find.mockResolvedValue([
      { id: 'task-1', projectId: 'proj-1', assigneeId: 'user-1' },
      { id: 'task-2', projectId: 'proj-1', assigneeId: 'user-1' },
    ]);

    await clearAssigneeForRemovedDevelopers(
      mockManager as unknown as EntityManager,
      ['proj-1'],
      ['user-1'],
    );

    expect(mockManager.insert).toHaveBeenCalledWith(TaskMovement, [
      {
        taskId: 'task-1',
        projectId: 'proj-1',
        actorKind: TaskMovementActorKind.SYSTEM,
        actorUserId: null,
        kind: TaskMovementKind.ASSIGNEE_CHANGE,
        previousValue: 'user-1',
        newValue: null,
      },
      {
        taskId: 'task-2',
        projectId: 'proj-1',
        actorKind: TaskMovementActorKind.SYSTEM,
        actorUserId: null,
        kind: TaskMovementKind.ASSIGNEE_CHANGE,
        previousValue: 'user-1',
        newValue: null,
      },
    ]);
  });

  it('es un no-op cuando projectIds está vacío (ni find ni update ni insert)', async () => {
    const mockManager = makeMockManager();

    await clearAssigneeForRemovedDevelopers(
      mockManager as unknown as EntityManager,
      [],
      ['user-1'],
    );

    expect(mockManager.find).not.toHaveBeenCalled();
    expect(mockManager.update).not.toHaveBeenCalled();
    expect(mockManager.insert).not.toHaveBeenCalled();
  });

  it('es un no-op cuando removedUserIds está vacío', async () => {
    const mockManager = makeMockManager();

    await clearAssigneeForRemovedDevelopers(
      mockManager as unknown as EntityManager,
      ['proj-1'],
      [],
    );

    expect(mockManager.find).not.toHaveBeenCalled();
    expect(mockManager.update).not.toHaveBeenCalled();
    expect(mockManager.insert).not.toHaveBeenCalled();
  });

  it('cero filas afectadas (find vacío): no llama a update ni a insert', async () => {
    const mockManager = makeMockManager();
    mockManager.find.mockResolvedValue([]);

    await clearAssigneeForRemovedDevelopers(
      mockManager as unknown as EntityManager,
      ['proj-1'],
      ['user-1'],
    );

    expect(mockManager.find).toHaveBeenCalled();
    expect(mockManager.update).not.toHaveBeenCalled();
    expect(mockManager.insert).not.toHaveBeenCalled();
  });
});
