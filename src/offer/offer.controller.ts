import { Controller, Post, Get, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { OfferService } from './offer.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { JwtAdminGuard } from 'src/guard';


@Controller('offer')
export class OfferController {
    constructor(private readonly offerService: OfferService) { }

    @UseGuards(JwtAdminGuard)
    @Post('create')
    create(@Body() dto: CreateOfferDto) {
        return this.offerService.create(dto);
    }

    @Get('get-all')
    findAll() {
        return this.offerService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.offerService.findOne(id);
    }

    @UseGuards(JwtAdminGuard)
    @Delete(':id')
    delete(@Param('id') id: string) {
        return this.offerService.delete(id);
    }
}