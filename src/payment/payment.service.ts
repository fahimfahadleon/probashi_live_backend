import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { HistoryEventType, PaymentStatus, ProductType } from 'generated/prisma';


@Injectable()
export class PaymentService {
    constructor(private prisma: PrismaService) { }

    async getPaymentDashboardData() {
        const prisma = this.prisma;

        // Monthly stats (using raw SQL to force numeric/float)
        const monthlyStats = await prisma.$queryRaw<
            { month: string; totalDiamonds: number; totalRevenue: number }[]
        >`
    SELECT 
      TO_CHAR("createdAt", 'YYYY-MM') AS month,
      COALESCE(SUM("diamonds")::float, 0) AS "totalDiamonds",
      COALESCE(SUM("price")::float, 0) AS "totalRevenue"
    FROM "PaymentHistory"
    GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
    ORDER BY month
  `;

        // Today's stats
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const todayStatsRaw = await prisma.paymentHistory.aggregate({
            _sum: { diamonds: true, price: true },
            where: { createdAt: { gte: today, lt: tomorrow } },
        });

        // Convert BigInt to number
        const todayStats = {
            _sum: {
                diamonds: Number(todayStatsRaw._sum.diamonds ?? 0),
                price: Number(todayStatsRaw._sum.price ?? 0),
            },
        };

        // Gateways
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        const gateways = settings?.gateways || [];

        return { monthlyStats, todayStats, gateways };
    }


    // Create a new payment
    async create(dto: CreatePaymentDto, userId: string) {
        const existing = await this.prisma.payment.findUnique({
            where: { transactionId: dto.transactionId },
        });
        if (existing) throw new ConflictException('Transaction ID already used');

        const product = await this.prisma.product.findUnique({
            where: { id: dto.productId },
            include: { vipPack: true, offer: true },
        });
        if (!product) throw new BadRequestException('Product not found');

        let price = 0;
        if (product.type === ProductType.VIP_PACK && product.vipPack) price = product.vipPack.price;
        else if (product.type === ProductType.OFFER && product.offer) price = product.offer.price;

        return this.prisma.payment.create({
            data: {
                transactionId: dto.transactionId,
                method: dto.method,
                status: PaymentStatus.PENDING,
                userId,
                productId: product.id,
                description: dto.description,
                histories: { create: { userId, eventType: HistoryEventType.CREATED, price } },
            },
            include: { histories: true },
        });
    }

    // Fetch all pending payments
    async findAllPending() {
        return this.prisma.payment.findMany({
            where: { status: PaymentStatus.PENDING },
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { id: true, name: true, profilePic: true } },
                product: { include: { vipPack: true, offer: true } },
                histories: true,
            },
        });
    }

    // Accept a payment
    async acceptPayment(paymentId: string) {
        const payment = await this.prisma.payment.findUnique({
            where: { id: paymentId },
            include: { user: true, product: { include: { vipPack: true, offer: true } } },
        });

        if (!payment) throw new NotFoundException('Payment not found');
        if (payment.status !== PaymentStatus.PENDING)
            throw new BadRequestException('Payment already processed');

        // Determine diamonds to add
        let diamondsToAdd = 0;
        if (payment.product.type === ProductType.VIP_PACK && payment.product.vipPack) {
            diamondsToAdd = payment.product.vipPack.diamonds;
        } else if (payment.product.type === ProductType.OFFER && payment.product.offer) {
            diamondsToAdd = payment.product.offer.diamonds;
        }

        const price = payment.product.vipPack?.price ?? payment.product.offer?.price ?? 0;

        // Perform all updates atomically
        await this.prisma.$transaction(async (prisma) => {
            if (diamondsToAdd > 0) {
                await prisma.user.update({
                    where: { id: payment.userId },
                    data: { diamond: { increment: diamondsToAdd } },
                });
            }

            await prisma.paymentHistory.updateMany({
                where: { paymentId: payment.id, eventType: HistoryEventType.CREATED },
                data: {
                    eventType: HistoryEventType.APPROVED,
                    diamonds: diamondsToAdd,
                    price,
                    description: 'Payment approved by admin',
                },
            });

            await prisma.payment.update({
                where: { id: payment.id },
                data: { status: PaymentStatus.APPROVED },
            });
        });

        return { success: true, message: 'Payment approved successfully' };
    }

    // Decline a payment
    async declinePayment(paymentId: string) {
        const payment = await this.prisma.payment.findUnique({
            where: { id: paymentId },
            include: { product: { include: { vipPack: true, offer: true } } },
        });

        if (!payment) throw new NotFoundException('Payment not found');
        if (payment.status !== PaymentStatus.PENDING)
            throw new BadRequestException('Only pending payments can be declined');

        const price = payment.product.vipPack?.price ?? payment.product.offer?.price ?? 0;

        await this.prisma.$transaction(async (prisma) => {
            await prisma.paymentHistory.updateMany({
                where: { paymentId: payment.id, eventType: HistoryEventType.CREATED },
                data: {
                    eventType: HistoryEventType.DECLINED,
                    price,
                    description: 'Payment declined by admin',
                },
            });

            await prisma.payment.update({
                where: { id: payment.id },
                data: { status: PaymentStatus.DECLINED },
            });
        });

        return { success: true, message: 'Payment declined successfully' };
    }

}
