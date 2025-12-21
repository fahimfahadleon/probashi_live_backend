import { Injectable, NotFoundException } from '@nestjs/common';
import { RelationshipType } from 'generated/prisma';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateUserDto } from './dto/update.user.dto';

@Injectable()
export class ProfileService {
    constructor(private prisma: PrismaService) {

    }

    update(id: string, dto: UpdateUserDto) {
        return this.prisma.user.update({
            where: { id },
            data: dto,
        });
    }

    async getUserProfile(viewerId: string, targetUserId: string) {
        // 1️⃣ Fetch the target user
        const user = await this.prisma.user.findUnique({
            where: { id: targetUserId },
            select: {
                id: true,
                name: true,
                profilePic: true,
                bio: true,
                coin: true,
                diamond: true,
                level: true,
                vipStatus: true,
                badge: true,
                settings: true,
                extra: true,
                isBlocked: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) throw new NotFoundException('User not found');

        // 2️⃣ Fetch stats and relation
        const [followersCount, followingCount, friendsCount, relation] = await Promise.all([
            this.prisma.relationship.count({
                where: { toUserId: targetUserId, type: RelationshipType.FOLLOW },
            }),
            this.prisma.relationship.count({
                where: { fromUserId: targetUserId, type: RelationshipType.FOLLOW },
            }),
            this.prisma.relationship.count({
                where: { type: RelationshipType.FRIEND, OR: [{ fromUserId: targetUserId }, { toUserId: targetUserId }] },
            }),
            this.prisma.relationship.findUnique({
                where: { fromUserId_toUserId: { fromUserId: viewerId, toUserId: targetUserId } },
            }),
        ]);

        // Determine relation flags
        let isFollowing = false;
        let isFriend = false;

        if (relation) {
            if (relation.type === RelationshipType.FOLLOW) isFollowing = true;
            if (relation.type === RelationshipType.FRIEND) {
                isFollowing = true;
                isFriend = true;
            }
        } else {
            // Check reverse FRIEND (viewer was followed first)
            const reverse = await this.prisma.relationship.findUnique({
                where: { fromUserId_toUserId: { fromUserId: targetUserId, toUserId: viewerId } },
            });
            if (reverse?.type === RelationshipType.FRIEND) {
                isFollowing = true;
                isFriend = true;
            }
        }

        return {
            ...user,
            stats: {
                followers: followersCount,
                following: followingCount,
                friends: friendsCount,
            },
            relation: {
                isFollowing,
                isFriend,
            },
        };
    }

    async updateUserSettings(userId: string, newSettings: any) {
        return this.prisma.user.update({
            where: { id: userId },
            data: { settings: newSettings },
        });
    }
}
