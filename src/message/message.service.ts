import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MessageService {
    constructor(private prisma: PrismaService) { }

    async createMessage(senderId: string, receiverId: string, content: string) {
        return this.prisma.message.create({
            data: { senderId, receiverId, content },
        });
    }

    async getChatHistory(userId: string, otherUserId: string) {
        return this.prisma.message.findMany({
            where: {
                OR: [
                    { senderId: userId, receiverId: otherUserId },
                    { senderId: otherUserId, receiverId: userId },
                ],
            },
            orderBy: { createdAt: 'asc' },
        });
    }
}
