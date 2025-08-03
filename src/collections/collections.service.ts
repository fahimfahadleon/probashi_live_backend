import { BadRequestException, Injectable } from '@nestjs/common';
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

        console.log(JSON.stringify(v, null, 2)); // Pretty-print the actual data

        return v;
    }




    async createCategory(name: string) {
        const exists = await this.prisma.collectionsCategory.findUnique({ where: { name } });
        if (exists) throw new Error('Category already exists');
        return this.prisma.collectionsCategory.create({ data: { name } });
    }
    async purchaseCollection(userId: string, type: string, name: string) {
        // 1. Fetch user diamonds and settings
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { diamond: true, settings: true },
        });
        if (!user) throw new BadRequestException('User not found');

        // 2. Fetch the collection item price (frame/bubble/entrance)
        const collectionItem = await this.prisma.collections.findUnique({
            where: { name: name }, // Assuming name is unique as per your schema
        });
        if (!collectionItem) throw new BadRequestException('Collection item not found');

        // 3. Check if user has enough diamonds
        if (user.diamond < collectionItem.price) {
            throw new BadRequestException('Not enough diamonds');
        }

        // 4. Prepare settings update
        const settings: any = user.settings ?? {};
        if (!Array.isArray(settings[type])) {
            settings[type] = [];
        }
        if (settings[type].includes(name)) {
            throw new BadRequestException(`You already own this ${type}`);
        }

        // 5. Start transaction for atomicity
        return await this.prisma.$transaction(async (tx) => {
            // Deduct diamonds from user
            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: {
                    diamond: { decrement: collectionItem.price },
                    settings: settings,
                },
            });

            // Update settings JSON with new purchase
            settings[type].push(name);
            await tx.user.update({
                where: { id: userId },
                data: {
                    settings: settings,
                },
            });

            // Insert purchase history record
            await tx.collectionPurchaseHistory.create({
                data: {
                    userId: userId,
                    type: type,
                    name: name,
                    price: collectionItem.price,
                },
            });

            return {
                message: `${type} '${name}' purchased successfully`,
                diamondRemaining: updatedUser.diamond,
                settings,
            };
        });
    }


}
