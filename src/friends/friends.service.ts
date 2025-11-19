import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RelationshipType } from 'generated/prisma';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateReportDto } from './dto/update-report.dto';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class FriendsService {
    constructor(private prisma: PrismaService) { }

    // -----------------------------
    // Get stats: followers, following, friends count
    // -----------------------------
    async getUserStats(userId: string) {
        const [followersCount, followingCount, friendsCount] = await Promise.all([
            this.prisma.relationship.count({
                where: { toUserId: userId, type: RelationshipType.FOLLOW },
            }),
            this.prisma.relationship.count({
                where: { fromUserId: userId, type: RelationshipType.FOLLOW },
            }),
            this.prisma.relationship.count({
                where: {
                    type: RelationshipType.FRIEND,
                    OR: [{ fromUserId: userId }, { toUserId: userId }],
                },
            }),
        ]);

        return { followers: followersCount, following: followingCount, friends: friendsCount };
    }

    // -----------------------------
    // Follow a user (or become FRIEND if mutual)
    // -----------------------------
    async followUser(fromUserId: string, toUserId: string) {
        if (fromUserId === toUserId) {
            throw new BadRequestException("You can't follow yourself.");
        }

        const existing = await this.prisma.relationship.findUnique({
            where: { fromUserId_toUserId: { fromUserId, toUserId } },
        });
        if (existing) {
            throw new BadRequestException('You already follow this user.');
        }

        const reverse = await this.prisma.relationship.findUnique({
            where: { fromUserId_toUserId: { fromUserId: toUserId, toUserId: fromUserId } },
        });

        if (reverse) {
            if (reverse.type === RelationshipType.FRIEND) {
                throw new BadRequestException('You are already friends.');
            }
            if (reverse.type === RelationshipType.FOLLOW) {
                return this.prisma.$transaction(async (tx) => {
                    await tx.relationship.update({
                        where: { id: reverse.id },
                        data: { type: RelationshipType.FRIEND },
                    });

                    const friendRelation = await tx.relationship.create({
                        data: { fromUserId, toUserId, type: RelationshipType.FRIEND },
                    });

                    return this.getRelationDTO(friendRelation);
                });
            }
        }

        const followRelation = await this.prisma.relationship.create({
            data: { fromUserId, toUserId, type: RelationshipType.FOLLOW },
        });

        return this.getRelationDTO(followRelation);
    }

    // -----------------------------
    // Unfollow a user
    // -----------------------------
    async unfollowUser(fromUserId: string, toUserId: string) {
        const relation = await this.prisma.relationship.findUnique({
            where: { fromUserId_toUserId: { fromUserId, toUserId } },
        });
        if (!relation) {
            throw new BadRequestException("You're not following this user.");
        }

        if (relation.type === RelationshipType.FRIEND) {
            await this.prisma.relationship.updateMany({
                where: { fromUserId: toUserId, toUserId: fromUserId, type: RelationshipType.FRIEND },
                data: { type: RelationshipType.FOLLOW },
            });
        }

        await this.prisma.relationship.delete({ where: { id: relation.id } });

        const targetUser = await this.prisma.user.findUnique({
            where: { id: toUserId },
            select: { id: true, name: true, profilePic: true, vipStatus: true },
        });

        return {
            ...targetUser,
            relation: { isFollowing: false, isFriend: false },
        };
    }

    // -----------------------------
    // Get all relations for a user
    // -----------------------------
    async getUserRelations(userId: string) {
        const userExists = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });
        if (!userExists) throw new NotFoundException('User not found.');

        const [following, followers, friends] = await Promise.all([
            this.prisma.relationship.findMany({
                where: { fromUserId: userId, type: RelationshipType.FOLLOW },
                include: { toUser: true },
            }),
            this.prisma.relationship.findMany({
                where: { toUserId: userId, type: RelationshipType.FOLLOW },
                include: { fromUser: true },
            }),
            this.prisma.relationship.findMany({
                where: {
                    type: RelationshipType.FRIEND,
                    OR: [{ fromUserId: userId }, { toUserId: userId }],
                },
                include: { fromUser: true, toUser: true },
            }),
        ]);

        return {
            following: following.map((r) => this.mapToDTO(r.toUser, true, false)),
            followers: followers.map((r) => this.mapToDTO(r.fromUser, false, false)),
            friends: friends.map((r) => {
                const friend = r.fromUserId === userId ? r.toUser : r.fromUser;
                return this.mapToDTO(friend, true, true);
            }),
        };
    }

    // -----------------------------
    // Helper: map a user to DTO
    // -----------------------------
    private mapToDTO(user: any, isFollowing: boolean, isFriend: boolean): any {
        return {
            id: user.id,
            name: user.name,
            profilePic: user.profilePic,
            vipStatus: user.vipStatus ?? false,
            relation: { isFollowing, isFriend },
        };
    }

    // -----------------------------
    // Helper: get relation DTO after creation
    // -----------------------------
    private async getRelationDTO(relation: any) {
        const targetUser = await this.prisma.user.findUnique({
            where: { id: relation.toUserId },
            select: { id: true, name: true, profilePic: true, vipStatus: true },
        });

        return {
            ...targetUser,
            relation: {
                isFollowing: true,
                isFriend: relation.type === RelationshipType.FRIEND,
            },
        };
    }






    async createReport(dto: CreateReportDto, reporterId?: string) {
        return this.prisma.userReport.create({
            data: {
                email: dto.email,
                reason: dto.reason,
                targetId: dto.targetId,
                reporterId,
            },
        });
    }

    async getReports(status: "PENDING") {
        return this.prisma.userReport.findMany({
            where: status ? { status } : {},
            orderBy: { createdAt: 'desc' },
            include: { reporter: true, target: true },
        });
    }

    async updateReport(reportId: string, dto: UpdateReportDto,) {
        const report = await this.prisma.userReport.findUnique({ where: { id: reportId } });
        if (!report) throw new NotFoundException('Report not found');

        return this.prisma.userReport.update({
            where: { id: reportId },
            data: {
                status: dto.status,
                reviewedBy: "admin",
                reviewedAt: new Date(),
            },
        });
    }

    async getReportById(reportId: string) {
        const report = await this.prisma.userReport.findUnique({
            where: { id: reportId },
            include: { reporter: true, target: true },
        });
        if (!report) throw new NotFoundException('Report not found');
        return report;
    }







}
