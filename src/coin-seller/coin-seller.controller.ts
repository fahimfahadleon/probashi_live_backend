import { Body, Controller, Get, Param, Post, UseGuards, Patch } from '@nestjs/common';
import { CoinSellerService } from './coin-seller.service';
import { JwtAdminGuard, JwtGuard } from 'src/guard';
import { CreateCoinSellerDto } from './dto/coin-seller.dto';
import { SendCoinsDto } from './dto/send-coins.dto';


@Controller('coin-seller')
export class CoinSellerController {
    constructor(private readonly coinSellerService: CoinSellerService) { }

    @UseGuards(JwtGuard)
    @Post()
    createSeller(@Body() dto: CreateCoinSellerDto) {
        return this.coinSellerService.createSeller(dto);
    }

    // Update seller status
    @UseGuards(JwtAdminGuard)
    @Patch(':id/status')
    async updateStatus(
        @Param('id') id: string,
        @Body('status') status: 'active' | 'inactive',
    ) {
        return this.coinSellerService.updateStatus(id, status);
    }

    // Recharge coins
    @UseGuards(JwtAdminGuard)
    @Patch(':id/recharge')
    async recharge(
        @Param('id') id: string,
        @Body('amount') amount: number,
    ) {
        return this.coinSellerService.rechargeSeller(id, amount);
    }

    @UseGuards(JwtAdminGuard)
    @Get()
    findAll() {
        return this.coinSellerService.findAll();
    }
    @Get(':id/history')
    getSendHistory(@Param('id') id: string) {
        return this.coinSellerService.getSendHistory(id);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.coinSellerService.findOne(id);
    }

    @UseGuards(JwtGuard)
    @Post('send')
    sendCoins(@Body() dto: SendCoinsDto) {
        return this.coinSellerService.sendCoins(dto.sellerId, dto.fromId, dto.toUserId, dto.amount);
    }



}