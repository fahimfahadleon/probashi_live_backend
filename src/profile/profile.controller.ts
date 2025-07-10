import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { JwtGuard } from 'src/guard';
import { CurrentUser } from 'src/auth/decorator/current-user.decorator';

@Controller('profile')
export class ProfileController {
    constructor(private userProfile: ProfileService) {

    }
    @UseGuards(JwtGuard)
    @Get('me')
    async getMyProfile(@CurrentUser() user: { id: string }) {
        return this.userProfile.getUserProfile(user.id, user.id);
    }

    @UseGuards(JwtGuard)
    @Get(':id')
    async getProfile(
        @Param('id') targetUserId: string,
        @CurrentUser() user: { id: string }
    ) {
        return this.userProfile.getUserProfile(user.id, targetUserId);
    }
}
