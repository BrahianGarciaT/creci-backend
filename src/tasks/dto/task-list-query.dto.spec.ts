import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TaskPriority, TaskStatus } from '../tasks.entity';
import { TaskListQueryDto } from './task-list-query.dto';

describe('TaskListQueryDto', () => {
  it('acepta status/priority ausentes', async () => {
    const dto = plainToInstance(TaskListQueryDto, {});

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('acepta status y priority válidos', async () => {
    const dto = plainToInstance(TaskListQueryDto, {
      status: TaskStatus.DONE,
      priority: TaskPriority.HIGH,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rechaza status=archived por no pertenecer a TaskStatus', async () => {
    const dto = plainToInstance(TaskListQueryDto, { status: 'archived' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('status');
  });

  it('rechaza priority=urgent por no pertenecer a TaskPriority', async () => {
    const dto = plainToInstance(TaskListQueryDto, { priority: 'urgent' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('priority');
  });
});
