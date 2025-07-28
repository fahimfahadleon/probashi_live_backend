/* eslint-disable prettier/prettier */
import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtGuard } from 'src/guard';
import { CurrentUser } from 'src/auth/decorator/current-user.decorator';

@UseGuards(JwtGuard)
@Controller('friends')
export class FriendsController {

    constructor(private readonly friendsService: FriendsService) { }
    // Follow a user
    @Post('follow/:userId')
    async followUser(
        @Param('userId') userId: string,
        @CurrentUser() user: { id: string },
    ) {
        return this.friendsService.followUser(user.id, userId);
    }

    @Delete('unfollow/:userId')
    async unfollowUser(
        @Param('userId') userId: string,
        @CurrentUser() user: { id: string },
    ) {
        return this.friendsService.unfollowUser(user.id, userId);
    }

    @Get('stats/:id')
    async getUserStats(@Param('id') userId: string) {
        return this.friendsService.getUserStats(userId);
    }
}
