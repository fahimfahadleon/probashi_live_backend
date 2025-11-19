import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';

import { CreateVIPDiamondDto } from './dto/create-vip-diamond.dto';
import { JwtAdminGuard } from 'src/guard';
import { CreateOfferDto } from './dto/create-offer.dto';
import { VipService } from './vip.service';


@Controller('vip')
export class VipController {
    constructor(private readonly vipService: VipService) { }

    // VIP Diamond Packs
    @UseGuards(JwtAdminGuard)
    @Post('diamond-pack')
    createVipPack(@Body() dto: CreateVIPDiamondDto) {
        return this.vipService.createVipPack(dto);
    }

    @Get('diamond-pack')
    findAllVipPacks() {
        return this.vipService.findAllVipPacks();
    }

    @Delete('diamond-pack/:id')
    deleteVipPack(@Param('id') id: string) {
        return this.vipService.deleteVipPack(id);
    }

    // Offers
    @UseGuards(JwtAdminGuard)
    @Post('offer')
    createOffer(@Body() dto: CreateOfferDto) {
        return this.vipService.createOffer(dto);
    }

    @Get('offer')
    findAllOffers() {
        return this.vipService.findAllOffers();
    }

    @Delete('offer/:id')
    deleteOffer(@Param('id') id: string) {
        return this.vipService.deleteOffer(id);
    }
}
