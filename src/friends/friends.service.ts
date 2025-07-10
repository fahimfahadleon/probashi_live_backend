import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class FriendsService {
    constructor(private prisma: PrismaService) {

    }
    async followUser(followerId: string, followingId: string) {
        // Step 1: Create Follow entry
        await this.prisma.follow.create({
            data: { followerId, followingId }
        });

        // Step 2: Check if followingId also follows followerId
        const isMutual = await this.prisma.follow.findUnique({
            where: {
                followerId_followingId: {
                    followerId: followingId,
                    followingId: followerId,
                }
            }
        });

        // Step 3: If mutual, create friendship
        if (isMutual) {
            await this.prisma.friendship.create({
                data: { userId: followerId, friendId: followingId }
            });
            await this.prisma.friendship.create({
                data: { userId: followingId, friendId: followerId }
            });
        }
    }

    async unfollowUser(followerId: string, followingId: string) {
        // Step 1: Delete Follow entry
        await this.prisma.follow.delete({
            where: {
                followerId_followingId: {
                    followerId,
                    followingId
                }
            }
        });

        // Step 2: Remove Friendship if it existed
        await this.prisma.friendship.deleteMany({
            where: {
                OR: [
                    { userId: followerId, friendId: followingId },
                    { userId: followingId, friendId: followerId },
                ]
            }
        });
    }

    async getUserStats(userId: string) {
        // Followers: people who follow me
        const followersCount = await this.prisma.follow.count({
            where: { followingId: userId },
        });

        // Following: people I follow
        const followingCount = await this.prisma.follow.count({
            where: { followerId: userId },
        });

        // Friends: mutual (bidirectional) friendship
        const friendsCount = await this.prisma.friendship.count({
            where: { userId },
        });

        return {
            followers: followersCount,
            following: followingCount,
            friends: friendsCount,
        };
    }
}
