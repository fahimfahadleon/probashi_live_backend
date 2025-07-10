import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AuthGuard } from '@nestjs/passport';
import { JwtAdminGuard, JwtGuard } from 'src/guard';
import { CurrentUser } from 'src/auth/decorator/current-user.decorator';


@Controller('payment')
export class PaymentController {
    constructor(private readonly paymentService: PaymentService) { }

    @UseGuards(JwtGuard)
    @Post('request-payment')
    create(@Body() dto: CreatePaymentDto, @CurrentUser() user: { id: string }) {
        const userId = user.id;
        return this.paymentService.create(dto, userId);
    }

    @UseGuards(JwtAdminGuard)
    @Get('all')
    findAll() {
        return this.paymentService.findAll();
    }
    @UseGuards(JwtAdminGuard) // Assuming only admin can decline
    @Post('decline/:id')
    async declinePayment(@Param('id') id: string) {
        return this.paymentService.declinePayment(id);
    }
    @UseGuards(JwtAdminGuard) // Only admin can approve
    @Post('accept/:id')
    async acceptPayment(@Param('id') id: string) {
        return this.paymentService.acceptPayment(id);
    }
}