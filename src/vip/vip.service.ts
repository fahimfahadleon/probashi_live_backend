import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateVIPDiamondDto } from './dto/create-vip-diamond.dto';

@Injectable()
export class VipService {
    constructor(private prisma: PrismaService) { }

    createDiamondPack(dto: CreateVIPDiamondDto) {
        return this.prisma.vIPDiamondPack.create({
            data: {
                price: dto.price,
                diamonds: dto.diamonds,
            },
        });
    }

    findAllDiamondPacks() {
        return this.prisma.vIPDiamondPack.findMany({
            orderBy: { price: 'asc' },
        });
    }

    deleteDiamondPack(id: string) {
        return this.prisma.vIPDiamondPack.delete({ where: { id } });
    }
}
