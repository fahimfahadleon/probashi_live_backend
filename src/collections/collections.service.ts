import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CollectionsService {
    constructor(private prisma: PrismaService) { }


    async createCollections(data: Prisma.CollectionsCreateInput) {
        return this.prisma.collections.create({ data });
    }


    async getAllCategoriesWithCollections() {
        const v = await this.prisma.collectionsCategory.findMany({
            include: {
                collections: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                        imageUrl: true,
                        thumbnailUrl: true,
                    },
                },
            },
        });

        return v;
    }




    async createCategory(name: string) {
        const exists = await this.prisma.collectionsCategory.findUnique({ where: { name } });
        if (exists) throw new Error('Category already exists');
        return this.prisma.collectionsCategory.create({ data: { name } });
    }
    async purchaseCollection(userId: string, type: string, name: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { diamond: true, settings: true },
        });
        if (!user) throw new BadRequestException('User not found');

        const collectionItem = await this.prisma.collections.findUnique({
            where: { name },
        });
        if (!collectionItem) throw new BadRequestException('Collection item not found');

        if (user.diamond < collectionItem.price) {
            throw new BadRequestException('Not enough diamonds');
        }

        const settings: any = user.settings ?? {};
        if (!Array.isArray(settings[type])) {
            settings[type] = [];
        }
        if (settings[type].includes(name)) {
            throw new BadRequestException(`You already own this ${type}`);
        }

        return await this.prisma.$transaction(async (tx) => {
            // 1. Deduct diamonds
            await tx.user.update({
                where: { id: userId },
                data: {
                    diamond: { decrement: collectionItem.price },
                },
            });

            // 2. Update settings
            settings[type].push(name);
            await tx.user.update({
                where: { id: userId },
                data: {
                    settings: settings,
                },
            });

            // 3. Log purchase history
            await tx.collectionPurchaseHistory.create({
                data: {
                    userId,
                    type,
                    name,
                    price: collectionItem.price,
                },
            });

            // ✅ 4. Return full updated user
            return await tx.user.findUnique({
                where: { id: userId },
                include: {
                    liveUsers: true,
                    followedBy: true,
                    following: true,
                    friends: true,
                    friendedBy: true,
                    payments: true,
                    paymentHistory: true,
                    sentMessages: true,
                    receivedMessages: true,
                    collectionPurchaseHistory: true,
                },
            });
        });
    }



    async getSvgaUrlByName(name: string) {
        const collection = await this.prisma.collections.findUnique({
            where: { name },
            select: {
                imageUrl: true,
                thumbnailUrl: true, // optional, include if needed
            },
        });

        if (!collection) {
            throw new NotFoundException(`Collection "${name}" not found`);
        }

        return collection; // returns an object { imageUrl, thumbnailUrl }
    }

}
