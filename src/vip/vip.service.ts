import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateVIPDiamondDto } from './dto/create-vip-diamond.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { ProductType } from 'generated/prisma';


@Injectable()
export class VipService {
    constructor(private prisma: PrismaService) { }

    // ----- VIP PACKS -----
    async createVipPack(dto: CreateVIPDiamondDto) {
        const vipPack = await this.prisma.vIPDiamondPack.create({
            data: { diamonds: dto.diamonds, price: dto.price },
        });

        return this.prisma.product.create({
            data: { type: ProductType.VIP_PACK, vipPackId: vipPack.id },
            include: { vipPack: true },
        });
    }

    async findAllVipPacks() {
        var pack = await this.prisma.product.findMany({
            where: { type: ProductType.VIP_PACK },
            include: { vipPack: true },
        });
        console.log('This is a log message', pack); // now prints the actual data

        return pack;
    }

    async deleteVipPack(productId: string) {
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
        });
        if (!product || !product.vipPackId) throw new NotFoundException('VIP pack not found');

        await this.prisma.vIPDiamondPack.delete({ where: { id: product.vipPackId } });
        await this.prisma.product.delete({ where: { id: productId } });

        return { message: 'VIP pack deleted' };
    }

    // ----- OFFERS -----
    async createOffer(dto: CreateOfferDto) {
        const offer = await this.prisma.offer.create({
            data: { title: dto.title, content: dto.content, price: dto.price, diamonds: dto.diamonds },
        });

        return this.prisma.product.create({
            data: { type: ProductType.OFFER, offerId: offer.id },
            include: { offer: true },
        });
    }
    async findAllOffers() {
        const offer = await this.prisma.product.findMany({
            where: { type: ProductType.OFFER },
            include: { offer: true },
        });

        console.log('This is a log message', offer); // now prints the actual data

        return offer;
    }

    async deleteOffer(productId: string) {
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
        if (!product || !product.offerId) throw new NotFoundException('Offer not found');

        await this.prisma.offer.delete({ where: { id: product.offerId } });
        await this.prisma.product.delete({ where: { id: productId } });

        return { message: 'Offer deleted' };
    }
}
