import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CoinSellerService {
    constructor(private prisma: PrismaService) { }


    async createSeller(data: {
        userId: string;
        fullName: string;
        nationalId: string;
        phoneNumber: string;
        email: string;
    }) {
        return this.prisma.coinSeller.create({ data });
    }

    async findAll() {
        return this.prisma.coinSeller.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        profilePic: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }


    // Update status: active / inactive
    async updateStatus(sellerId: string, status: 'active' | 'inactive') {
        const seller = await this.prisma.coinSeller.findUnique({ where: { id: sellerId } });
        if (!seller) throw new NotFoundException('Seller not found');

        return this.prisma.coinSeller.update({
            where: { id: sellerId },
            data: { status },
        });
    }

    // Recharge seller by adding coins
    async rechargeSeller(sellerId: string, amount: number) {
        const seller = await this.prisma.coinSeller.findUnique({ where: { id: sellerId } });
        if (!seller) throw new NotFoundException('Seller not found');

        // Assuming you track diamonds in user model, or some balance field
        return this.prisma.user.update({
            where: { id: seller.userId },
            data: {
                diamond: { increment: amount }, // increment user's diamonds
            },
        });
    }


    // Get a seller by ID
    async findOne(userId: string) {
        const seller = await this.prisma.coinSeller.findFirst({
            where: { userId },
            include: { user: true, coinSendHistory: true },
        });
        if (!seller) throw new NotFoundException('Seller not found');
        return seller;
    }

    // Record a coin send history entry
    async sendCoins(
        sellerId: string,
        fromId: string,
        toUserId: string,
        amount: number
    ) {
        return this.prisma.$transaction(async (tx) => {
            // 1. Fetch sender
            const fromUser = await tx.user.findUnique({
                where: { id: fromId },
            });
            if (!fromUser) throw new NotFoundException('Sender not found');

            if (fromUser.diamond < amount) {
                throw new BadRequestException('Insufficient coins');
            }

            // 2. Fetch recipient
            const toUser = await tx.user.findUnique({
                where: { id: toUserId },
            });
            if (!toUser) throw new NotFoundException('Recipient not found');

            // 3. Update sender's diamond
            await tx.user.update({
                where: { id: fromId },
                data: { diamond: { decrement: amount } },
            });

            // 4. Update recipient's diamond
            await tx.user.update({
                where: { id: toUserId },
                data: { diamond: { increment: amount } },
            });

            // 5. Log the transaction
            try {
                await tx.coinSendHistory.create({
                    data: {
                        fromSellerId: sellerId,
                        toUserId,
                        amount,
                    },
                });

                return {
                    success: true,
                    message: `Successfully sent ${amount} coins to user ${toUserId}.`,
                };
            } catch (err) {
                console.error(err);
                return {
                    success: false,
                    message: 'Failed to send coins',
                };
            }
        });
    }


    // Get coin send history of a seller
    async getSendHistory(fromSellerId: string) {
        return this.prisma.coinSendHistory.findMany({
            where: { fromSellerId },
            include: { toUser: true },
            orderBy: { createdAt: 'desc' },
        });
    }
}
