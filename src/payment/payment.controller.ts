import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtGuard, JwtAdminGuard } from 'src/guard';
import { CurrentUser } from 'src/auth/decorator/current-user.decorator';


@Controller('payment')
export class PaymentController {
    constructor(private readonly paymentService: PaymentService) { }

    // ------------------ USER ------------------
    @UseGuards(JwtGuard)
    @Post('request-payment')
    create(
        @Body() dto: CreatePaymentDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.paymentService.create(dto, user.id);
    }

    // ------------------ ADMIN ------------------
    @UseGuards(JwtAdminGuard)
    @Get('all')
    findAllPending() {
        return this.paymentService.findAllPending();
    }

    @UseGuards(JwtAdminGuard)
    @Post('accept/:id')
    acceptPayment(@Param('id') id: string) {
        return this.paymentService.acceptPayment(id);
    }

    @UseGuards(JwtAdminGuard)
    @Post('decline/:id')
    declinePayment(@Param('id') id: string) {
        return this.paymentService.declinePayment(id);
    }

    @UseGuards(JwtAdminGuard)
    @Get('payments')
    async getPaymentDashboard() {
        return this.paymentService.getPaymentDashboardData();
    }
}
