import { Injectable } from '@nestjs/common';
import { CreateOfferDto } from './dto/create-offer.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class OfferService {
    constructor(private prisma: PrismaService) { }

    async create(data: CreateOfferDto) {
        return this.prisma.offer.create({ data });
    }

    async findAll() {
        return this.prisma.offer.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: string) {
        return this.prisma.offer.findUnique({ where: { id } });
    }

    async delete(id: string) {
        return this.prisma.offer.delete({ where: { id } });
    }
}