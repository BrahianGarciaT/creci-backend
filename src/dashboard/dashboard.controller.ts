import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/users.entity';
import { DashboardService } from './dashboard.service';
import {
  DashboardOverviewDto,
  ProjectDashboardDto,
} from './dto/dashboard-overview.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // GET /dashboard/overview — JWT-only (sin @Roles); el scope (org vs participant)
  // se decide en el servicio según currentUser.role
  @Get('overview')
  getOverview(@CurrentUser() currentUser: User): Promise<DashboardOverviewDto> {
    return this.dashboardService.getOverview(currentUser);
  }

  // GET /dashboard/projects/:id — JWT-only; assertCanRead(allowAdmin: true) en el
  // servicio decide 404 (proyecto inexistente) / 403 (developer no miembro)
  @Get('projects/:id')
  getProjectDetail(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
  ): Promise<ProjectDashboardDto> {
    return this.dashboardService.getProjectDetail(id, currentUser);
  }
}
