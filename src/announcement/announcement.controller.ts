import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { AnnouncementService } from './announcement.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { JwtAdminGuard } from 'src/guard';
import { CurrentUser } from 'src/auth/decorator/current-user.decorator';

@Controller('announcement')
export class AnnouncementController {
    constructor(private readonly announcementService: AnnouncementService) { }

    @UseGuards(JwtAdminGuard)
    @Post('create')
    create(@Body() dto: CreateAnnouncementDto) {
        return this.announcementService.create(dto);
    }

    @Get('get-all')
    findAll() {
        return this.announcementService.findAll();
    }

    @Get('get/:id') // ✅ Fixed colon placement
    findOne(@Param('id') id: string) {
        return this.announcementService.findOne(id);
    }

    @UseGuards(JwtAdminGuard)
    @Delete('remove/:id') // ✅ Fixed colon placement
    delete(@Param('id') id: string) {
        return this.announcementService.delete(id);
    }
}
