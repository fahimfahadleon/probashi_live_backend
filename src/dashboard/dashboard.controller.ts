import { Controller, Get, UseGuards } from '@nestjs/common';

import { DashboardService } from './dashboard.service';
import { JwtAdminGuard } from 'src/guard';


@Controller('admin')
@UseGuards(JwtAdminGuard)  // protect with JWT auth, adjust as needed
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    @Get('dashboard')
    async getDashboardData() {
        return this.dashboardService.getDashboardStats();
    }
}