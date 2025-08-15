import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DashboardService {
    constructor(private prisma: PrismaService) { }

    async getDashboardStats() {
        const totalUser = await this.prisma.user.count();

        const totalPaymentRequests = await this.prisma.payment.count({
            where: { status: 'PENDING' },  // count only pending payments
        });

        const vipUserCount = await this.prisma.user.count({
            where: { vipStatus: true },
        });

        const announcementCount = await this.prisma.announcement.count();
        const offerCount = await this.prisma.offer.count();
        const totalTopUps = await this.prisma.vIPDiamondPack.count(); // all top-ups without status filtering

        return {
            totalUser,
            liveUser: 0,
            activeUser: 0,
            vipUser: vipUserCount,
            revenue: {},
            post: 0,
            video: 0,
            report: 0,
            totalTopUps,
            totalPaymentRequests,
            announcementCount,
            offerCount,
        };
    }

    async getUsers(page: number, limit: number) {
        const skip = (page - 1) * limit;
        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                skip,
                take: 30,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    name: true,
                    diamond: true,
                    vipStatus: true,
                    level: true,
                    isBlocked: true,
                },
            }),
            this.prisma.user.count(),
        ]);

        return {
            users,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }

    async toggleBlock(id: string) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) throw new NotFoundException('User not found');

        return this.prisma.user.update({
            where: { id },
            data: { isBlocked: !user.isBlocked },
        });
    }

}
