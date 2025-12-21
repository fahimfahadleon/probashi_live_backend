import { Controller, Get, NotFoundException, Param, Patch, Query, UseGuards } from '@nestjs/common';

import { DashboardService } from './dashboard.service';
import { JwtAdminGuard } from 'src/guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetUsersDto } from './get.user.dto';


@Controller('admin')
@UseGuards(JwtAdminGuard)  // protect with JWT auth, adjust as needed
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    @Get('dashboard')
    async getDashboardData() {
        return this.dashboardService.getDashboardStats();
    }

    @Get('users')
    async getUsers(
        @Query() query: GetUsersDto
    ) {
        return this.dashboardService.getUsers(query.page, query.limit);
    }

    @Patch('users/:id/block')
    async toggleBlock(@Param('id') id: string) {
        return this.dashboardService.toggleBlock(id);
    }

}