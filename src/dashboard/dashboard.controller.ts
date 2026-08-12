import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/users.entity';
import { DashboardService } from './dashboard.service';
import { DashboardOverviewDto } from './dto/dashboard-overview.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // GET /dashboard/overview — JWT-only (sin @Roles); el scope (org vs participant)
  // se decide en el servicio según currentUser.role
  @Get('overview')
  getOverview(@CurrentUser() currentUser: User): Promise<DashboardOverviewDto> {
    return this.dashboardService.getOverview(currentUser);
  }
}
