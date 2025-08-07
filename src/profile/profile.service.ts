import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ProfileService {
    constructor(private prisma: PrismaService) {

    }

    async getUserProfile(viewerId: string, targetUserId: string) {
        console.log(viewerId);
        console.log(targetUserId);

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
                isBlocked: true,
                badge: true,
                settings: true,
                extra: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) throw new NotFoundException('User not found');

        const [followersCount, followingCount, friendsCount, isFollowing, isFriend] = await Promise.all([
            this.prisma.follow.count({ where: { followingId: targetUserId } }),
            this.prisma.follow.count({ where: { followerId: targetUserId } }),
            this.prisma.friendship.count({ where: { userId: targetUserId } }),

            this.prisma.follow.findUnique({
                where: {
                    followerId_followingId: {
                        followerId: viewerId,
                        followingId: targetUserId,
                    },
                },
            }).then(Boolean),

            this.prisma.friendship.findUnique({
                where: {
                    userId_friendId: {
                        userId: viewerId,
                        friendId: targetUserId,
                    },
                },
            }).then(Boolean),
        ]);

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
