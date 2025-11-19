import { Controller, Post, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { CoinSellerRequestService } from './coin-seller-request.service';
import { JwtAdminGuard, JwtGuard } from 'src/guard';
import { CreateCoinSellerRequestDto } from './dto/create-coin-seller-request.dto';

@Controller('coin-seller-request')
export class CoinSellerRequestController {
    constructor(private readonly service: CoinSellerRequestService) { }

    @UseGuards(JwtGuard)
    @Post('apply')
    apply(@Body() dto: CreateCoinSellerRequestDto) {
        return this.service.applyRequest(dto);
    }
    @UseGuards(JwtAdminGuard)
    @Get('pending')
    getPending() {
        return this.service.getPendingRequests();
    }

    @UseGuards(JwtAdminGuard)
    @Patch(':id/approve')
    approve(@Param('id') id: string) {
        return this.service.approveRequest(id);
    }

    @UseGuards(JwtAdminGuard)
    @Patch(':id/reject')
    reject(@Param('id') id: string) {
        return this.service.rejectRequest(id);
    }


    @Get('user/:userId')
    getUserRequest(@Param('userId') userId: string) {
        return this.service.getRequestByUser(userId);
    }
}
