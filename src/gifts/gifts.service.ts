import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma';

import { PrismaService } from 'src/prisma/prisma.service';


@Injectable()
export class GiftsService {
    constructor(private prisma: PrismaService) { }


    async createGift(data: Prisma.GiftCreateInput) {
        return this.prisma.gift.create({ data });
    }

    async getAllCategoriesWithGifts() {
        return this.prisma.giftCategory.findMany({
            include: {
                gifts: {
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
    }

    deleteGift(id: string) {
        return this.prisma.gift.delete({ where: { id } });
    }

    async createCategory(name: string) {
        return this.prisma.giftCategory.create({ data: { name } });
    }

}
