import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAnnouncementDto } from './dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AnnouncementService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateAnnouncementDto) {
        return this.prisma.announcement.create({
            data: {
                title: dto.title,
                message: dto.message,
            },
        });
    }

    async findAll() {
        return this.prisma.announcement.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: string) {
        const announcement = await this.prisma.announcement.findUnique({ where: { id } });
        if (!announcement) throw new NotFoundException('Announcement not found');
        return announcement;
    }

    async delete(id: string) {
        return this.prisma.announcement.delete({ where: { id } });
    }

}
