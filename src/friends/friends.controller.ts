/* eslint-disable prettier/prettier */
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAdminGuard, JwtGuard } from 'src/guard';
import { CurrentUser } from 'src/auth/decorator/current-user.decorator';
import { UpdateReportDto } from './dto/update-report.dto';
import { CreateReportDto } from './dto/create-report.dto';


@Controller('friends')
export class FriendsController {

    constructor(private readonly friendsService: FriendsService) { }
    // Follow a user
    @UseGuards(JwtGuard)
    @Post('follow/:userId')
    async followUser(
        @Param('userId') userId: string,
        @CurrentUser() user: { id: string },
    ) {
        return this.friendsService.followUser(user.id, userId);
    }

    @UseGuards(JwtGuard)
    @Get(':id/relations')
    async getUserRelations(
        @Param('id') userId: string,
    ) {
        return this.friendsService.getUserRelations(userId);
    }

    @UseGuards(JwtGuard)
    @Delete('unfollow/:userId')
    async unfollowUser(
        @Param('userId') userId: string,
        @CurrentUser() user: { id: string },
    ) {
        return this.friendsService.unfollowUser(user.id, userId);
    }

    @UseGuards(JwtGuard)
    @Get('stats/:id')
    async getUserStats(@Param('id') userId: string) {
        return this.friendsService.getUserStats(userId);
    }





    @UseGuards(JwtGuard)
    @Post('report')
    async createReport(@Body() dto: CreateReportDto, @CurrentUser() user: { id: string }) {
        // optional if authenticated
        return this.friendsService.createReport(dto, user.id);
    }

    // Admin: fetch all reports with optional status filter
    @UseGuards(JwtAdminGuard) // replace with your admin guard
    @Get('reports')
    async getReports(@Query('status') status?: string) {
        return this.friendsService.getReports(status as "PENDING");
    }

    // Admin: get single report
    @UseGuards(JwtAdminGuard)
    @Get('/report/:id')
    async getReport(@Param('id') id: string) {
        return this.friendsService.getReportById(id);
    }

    // Admin: update report status
    @UseGuards(JwtAdminGuard)
    @Patch('/report/:id')
    async updateReport(@Param('id') id: string, @Body() dto: UpdateReportDto) {
        return this.friendsService.updateReport(id, dto);
    }






}
