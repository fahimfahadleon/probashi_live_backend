import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AddGatewayDto, AppSettingsDto, UpdateProfitMarginDto } from './dto';
import { JwtAdminGuard, JwtGuard } from 'src/guard';



@Controller('settings')
export class SettingsController {
    constructor(private readonly settingsService: SettingsService) { }

    @UseGuards(JwtGuard)
    @Get('get-settings')
    getSettings() {
        return this.settingsService.getSettings();
    }

    @UseGuards(JwtAdminGuard)
    @Put('profit-margin')
    updateProfitMargin(@Body() dto: UpdateProfitMarginDto) {
        return this.settingsService.updateProfitMargin(dto);
    }

    @UseGuards(JwtAdminGuard)
    @Post('gateway')
    addGateway(@Body() dto: AddGatewayDto) {
        return this.settingsService.addGateway(dto);
    }
    @UseGuards(JwtAdminGuard)
    @Delete('gateway/:id')
    removeGateway(@Param('id') id: string) {
        return this.settingsService.removeGateway(Number(id));
    }
    @UseGuards(JwtAdminGuard)
    @Put('app')
    updateAppSettings(@Body() dto: AppSettingsDto) {
        return this.settingsService.updateAppSettings(dto);
    }
}