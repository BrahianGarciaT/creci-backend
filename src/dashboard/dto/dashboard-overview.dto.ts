import { TaskStatus } from '../../tasks/tasks.entity';

// Pivot de conteos por status; siempre expone las 4 claves, sembradas en 0
export type StatusCounts = Record<TaskStatus, number>;

export interface TrendPoint {
  date: string; // 'YYYY-MM-DD'
  count: number;
}

// Serie de 30 días con zero-fill: nunca hay huecos, el frontend no necesita rellenar
export interface CompletionTrend {
  granularity: 'day';
  from: string;
  to: string;
  points: TrendPoint[];
}

export interface WorkloadEntry {
  userId: string;
  email: string;
  open: number;
  done: number;
  overdue: number;
}

export interface OverdueEntry {
  id: string;
  title: string;
  dueDate: string;
  projectId: string;
  projectName: string;
  assigneeEmail: string | null;
}

// completionRate es null cuando total === 0 (nunca se divide por cero)
export interface ProjectHealth {
  projectId: string;
  name: string;
  total: number;
  counts: StatusCounts;
  completionRate: number | null;
}

export interface DashboardOverviewDto {
  scope: 'org' | 'participant';
  projects: ProjectHealth[];
  workload: WorkloadEntry[];
  overdue: OverdueEntry[];
  overdueCount: number;
  trend: CompletionTrend;
}
