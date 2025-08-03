import { Controller, Get, Param, UseGuards, Patch, Body } from '@nestjs/common';
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


    @UseGuards(JwtGuard)
    @Patch('settings')
    async saveSettings(
        @CurrentUser() user: { id: string },
        @Body() settings: any,
    ) {
        console.log('Received settings:', JSON.stringify(settings, null, 2));
        return this.userProfile.updateUserSettings(user.id, settings);
    }

}
