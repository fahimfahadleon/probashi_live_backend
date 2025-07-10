import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { VipService } from './vip.service';
import { CreateVIPDiamondDto } from './dto/create-vip-diamond.dto';
import { JwtAdminGuard } from 'src/guard';

@Controller('vip')
export class VipController {
    constructor(private readonly vipService: VipService) { }

    @UseGuards(JwtAdminGuard)
    @Post('diamond-pack')
    create(@Body() dto: CreateVIPDiamondDto) {
        return this.vipService.createDiamondPack(dto);
    }


    @Get('diamond-pack')
    findAll() {
        return this.vipService.findAllDiamondPacks();
    }

    @Delete('diamond-pack/:id')
    delete(@Param('id') id: string) {
        return this.vipService.deleteDiamondPack(id);
    }
}
