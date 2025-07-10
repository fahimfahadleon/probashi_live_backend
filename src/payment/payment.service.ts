import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreatePaymentDto, userId: string) {
        // Check first
        const existing = await this.prisma.payment.findUnique({
            where: { transactionId: dto.transactionId },
        });

        if (existing) {
            throw new ConflictException('Transaction ID already used');
        }

        // Then create
        const payment = await this.prisma.payment.create({
            data: {
                transactionId: dto.transactionId,
                method: dto.method,
                itemId: dto.itemId,
                description: dto.description,
                userId: userId,
            },
        });

        return {
            message: 'Payment request created successfully',
            data: payment,
        };
    }
    async findAll() {
        return this.prisma.payment.findMany({
            where: { status: 'PENDING' },  // Only fetch payments with status PENDING
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        profilePic: true,
                    },
                },
                item: true, // Include the VIPDiamondPack data
            },
        });
    }

    async acceptPayment(paymentId: string) {
        const payment = await this.prisma.payment.findUnique({
            where: { id: paymentId },
            include: { user: true, item: true },
        });

        if (!payment) {
            throw new NotFoundException('Payment not found');
        }
        if (!payment.item) {
            throw new BadRequestException('Associated item not found');
        }

        const existingHistory = await this.prisma.paymentHistory.findUnique({
            where: { paymentId: payment.id },
        });

        if (existingHistory) {
            throw new ConflictException('Payment history already exists for this payment');
        }

        const updatedUser = await this.prisma.user.update({
            where: { id: payment.userId },
            data: {
                diamond: { increment: payment.item.diamonds },
                vipStatus: true,
                level: { increment: 5 },
            },
        });

        await this.prisma.paymentHistory.create({
            data: {
                userId: updatedUser.id,
                paymentId: payment.id,
                diamonds: payment.item.diamonds,
                price: payment.item.price,
                type: 'ADMIN_APPROVED',
            },
        });

        // Instead of deleting, update the payment status to APPROVED
        await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'APPROVED' },
        });

        return {
            message: 'Payment accepted and user updated',
            user: updatedUser,
        };
    }
    // src/payment/payment.service.ts
    async declinePayment(paymentId: string) {
        const payment = await this.prisma.payment.findUnique({
            where: { id: paymentId },
        });

        if (!payment) {
            throw new NotFoundException('Payment not found');
        }

        if (payment.status !== 'PENDING') {
            throw new BadRequestException('Only pending payments can be declined');
        }

        const updated = await this.prisma.payment.update({
            where: { id: paymentId },
            data: { status: 'DECLINED' },
        });

        return {
            message: 'Payment has been declined',
            data: updated,
        };
    }

}
