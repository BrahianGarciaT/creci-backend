import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../projects/projects.entity';
import { Task, TaskStatus } from '../tasks/tasks.entity';
import { User, UserRole } from '../users/users.entity';
import {
  CompletionTrend,
  DashboardOverviewDto,
  OverdueEntry,
  ProjectHealth,
  StatusCounts,
  TrendPoint,
  WorkloadEntry,
} from './dto/dashboard-overview.dto';

const TREND_WINDOW_DAYS = 30;
const OVERDUE_LIMIT = 50;

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  // GET /dashboard/overview — ADMIN ve todos los proyectos de la organización;
  // DEVELOPER solo ve los proyectos donde participa (mismo patrón que findMine)
  async getOverview(currentUser: User): Promise<DashboardOverviewDto> {
    const scope: 'org' | 'participant' =
      currentUser.role === UserRole.ADMIN ? 'org' : 'participant';

    const projects =
      scope === 'org'
        ? await this.projectsRepository.find()
        : await this.projectsRepository
            .createQueryBuilder('project')
            .innerJoin('project.developers', 'dev', 'dev.id = :userId', {
              userId: currentUser.id,
            })
            .getMany();

    const projectIds = projects.map((project) => project.id);

    if (projectIds.length === 0) {
      return {
        scope,
        projects: [],
        workload: [],
        overdue: [],
        overdueCount: 0,
        trend: this.zeroFilledTrend([]),
      };
    }

    const [countsByProject, workload, overdueResult, trend] = await Promise.all(
      [
        this.getStatusCountsByProject(projectIds),
        this.getWorkload(projectIds),
        this.getOverdue(projectIds),
        this.getCompletionTrend(projectIds),
      ],
    );

    return {
      scope,
      projects: this.buildProjectHealth(projects, countsByProject),
      workload,
      overdue: overdueResult.overdue,
      overdueCount: overdueResult.overdueCount,
      trend,
    };
  }

  // ── Shaping helpers (reutilizados por el endpoint de detalle en PR3) ────────

  private emptyStatusCounts(): StatusCounts {
    return {
      [TaskStatus.TODO]: 0,
      [TaskStatus.IN_PROGRESS]: 0,
      [TaskStatus.DONE]: 0,
      [TaskStatus.CANCELLED]: 0,
    };
  }

  // SELECT project_id, status, COUNT(*) ... GROUP BY project_id, status; pivotea a
  // StatusCounts por proyecto, sembrando las 4 claves en 0 (nunca hay claves faltantes)
  async getStatusCountsByProject(
    projectIds: string[],
  ): Promise<Map<string, StatusCounts>> {
    const countsByProject = new Map<string, StatusCounts>();
    for (const projectId of projectIds) {
      countsByProject.set(projectId, this.emptyStatusCounts());
    }
    if (projectIds.length === 0) return countsByProject;

    const rows = await this.tasksRepository
      .createQueryBuilder('task')
      .select('task.projectId', 'projectId')
      .addSelect('task.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('task.projectId IN (:...projectIds)', { projectIds })
      .groupBy('task.projectId')
      .addGroupBy('task.status')
      .getRawMany<{ projectId: string; status: TaskStatus; count: string }>();

    for (const row of rows) {
      const counts = countsByProject.get(row.projectId);
      // pg devuelve COUNT como string — coercionar con Number()
      if (counts) counts[row.status] = Number(row.count);
    }
    return countsByProject;
  }

  buildProjectHealth(
    projects: Pick<Project, 'id' | 'name'>[],
    countsByProject: Map<string, StatusCounts>,
  ): ProjectHealth[] {
    return projects.map((project) => {
      const counts =
        countsByProject.get(project.id) ?? this.emptyStatusCounts();
      const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
      return {
        projectId: project.id,
        name: project.name,
        total,
        counts,
        // never divide by zero
        completionRate: total === 0 ? null : counts[TaskStatus.DONE] / total,
      };
    });
  }

  // Ventana fija de 30 días (UTC, inclusive de hoy); devuelve las claves 'YYYY-MM-DD'
  // usadas para el zero-fill
  private buildTrendDateKeys(days = TREND_WINDOW_DAYS): {
    from: Date;
    dateKeys: string[];
  } {
    const to = new Date();
    to.setUTCHours(0, 0, 0, 0);
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - (days - 1));

    const dateKeys: string[] = [];
    const cursor = new Date(from);
    while (cursor.getTime() <= to.getTime()) {
      dateKeys.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return { from, dateKeys };
  }

  private zeroFilledTrend(
    rows: { day: Date | string; count: string }[],
  ): CompletionTrend {
    const { dateKeys } = this.buildTrendDateKeys();
    const countsByDate = new Map<string, number>();
    for (const row of rows) {
      const key = new Date(row.day).toISOString().slice(0, 10);
      countsByDate.set(key, Number(row.count));
    }
    const points: TrendPoint[] = dateKeys.map((date) => ({
      date,
      count: countsByDate.get(date) ?? 0,
    }));
    return {
      granularity: 'day',
      from: dateKeys[0],
      to: dateKeys[dateKeys.length - 1],
      points,
    };
  }

  // Tendencia de finalización de 30 días, zero-filled. Solo cuenta tareas `done`
  // con `completedAt` no nulo (excluye tareas done previas a este cambio)
  async getCompletionTrend(projectIds: string[]): Promise<CompletionTrend> {
    if (projectIds.length === 0) return this.zeroFilledTrend([]);

    const { from } = this.buildTrendDateKeys();

    const rows = await this.tasksRepository
      .createQueryBuilder('task')
      .select("date_trunc('day', task.completedAt)", 'day')
      .addSelect('COUNT(*)', 'count')
      .where('task.status = :status', { status: TaskStatus.DONE })
      .andWhere('task.completedAt IS NOT NULL')
      .andWhere('task.completedAt >= :from', { from })
      .andWhere('task.projectId IN (:...projectIds)', { projectIds })
      .groupBy("date_trunc('day', task.completedAt)")
      .getRawMany<{ day: Date | string; count: string }>();

    return this.zeroFilledTrend(rows);
  }

  // due_date < NOW() AND status NOT IN (done, cancelled) — idéntico al badge existente.
  // Lista ordenada por due_date ASC, LIMIT 50, con overdueCount exacto (no truncado)
  async getOverdue(
    projectIds: string[],
  ): Promise<{ overdue: OverdueEntry[]; overdueCount: number }> {
    if (projectIds.length === 0) return { overdue: [], overdueCount: 0 };

    const now = new Date();
    const excluded = [TaskStatus.DONE, TaskStatus.CANCELLED];

    const overdueCount = await this.tasksRepository
      .createQueryBuilder('task')
      .where('task.dueDate < :now', { now })
      .andWhere('task.status NOT IN (:...excluded)', { excluded })
      .andWhere('task.projectId IN (:...projectIds)', { projectIds })
      .getCount();

    const tasks = await this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.project', 'project')
      .leftJoinAndSelect('task.assignee', 'assignee')
      .where('task.dueDate < :now', { now })
      .andWhere('task.status NOT IN (:...excluded)', { excluded })
      .andWhere('task.projectId IN (:...projectIds)', { projectIds })
      .orderBy('task.dueDate', 'ASC')
      .limit(OVERDUE_LIMIT)
      .getMany();

    const overdue: OverdueEntry[] = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      dueDate: (task.dueDate as Date).toISOString(),
      projectId: task.projectId,
      projectName: task.project?.name ?? '',
      assigneeEmail: task.assignee?.email ?? null,
    }));

    return { overdue, overdueCount };
  }

  // Carga de trabajo por developer: abiertas (no done/cancelled), completadas y
  // vencidas, agregadas en SQL con COUNT(*) FILTER (WHERE ...)
  async getWorkload(projectIds: string[]): Promise<WorkloadEntry[]> {
    if (projectIds.length === 0) return [];

    const rows = await this.tasksRepository
      .createQueryBuilder('task')
      .innerJoin('task.assignee', 'assignee')
      .select('assignee.id', 'userId')
      .addSelect('assignee.email', 'email')
      .addSelect(
        'COUNT(*) FILTER (WHERE task.status NOT IN (:doneStatus, :cancelledStatus))',
        'open',
      )
      .addSelect('COUNT(*) FILTER (WHERE task.status = :doneStatus)', 'done')
      .addSelect(
        'COUNT(*) FILTER (WHERE task.dueDate < :now AND task.status NOT IN (:doneStatus, :cancelledStatus))',
        'overdue',
      )
      .where('task.projectId IN (:...projectIds)', { projectIds })
      .setParameters({
        doneStatus: TaskStatus.DONE,
        cancelledStatus: TaskStatus.CANCELLED,
        now: new Date(),
      })
      .groupBy('assignee.id')
      .addGroupBy('assignee.email')
      .getRawMany<{
        userId: string;
        email: string;
        open: string;
        done: string;
        overdue: string;
      }>();

    return rows.map((row) => ({
      userId: row.userId,
      email: row.email,
      open: Number(row.open),
      done: Number(row.done),
      overdue: Number(row.overdue),
    }));
  }
}
