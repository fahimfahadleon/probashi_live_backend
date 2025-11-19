import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CoinSellerService } from '../coin-seller/coin-seller.service';
import { RequestStatus } from 'src/request-status';
import { CreateCoinSellerRequestDto } from './dto/create-coin-seller-request.dto';


@Injectable()
export class CoinSellerRequestService {
    constructor(
        private prisma: PrismaService,
        private coinSellerService: CoinSellerService,
    ) { }

    async applyRequest(dto: CreateCoinSellerRequestDto) {
        // 1. Check if a request already exists for this user
        const existingRequest = await this.prisma.coinSellerRequest.findUnique({
            where: { userId: dto.userId },
        });

        if (existingRequest) {
            throw new BadRequestException('A pending request already exists for this user.');
        }

        // 2. Check if the user is already a CoinSeller
        const existingSeller = await this.prisma.coinSeller.findUnique({
            where: { userId: dto.userId },
        });

        if (existingSeller) {
            throw new BadRequestException('User is already a CoinSeller.');
        }

        // 3. Check for conflicts with unique fields in CoinSeller
        const conflict = await this.prisma.coinSeller.findFirst({
            where: {
                OR: [
                    { nationalId: dto.nationalId },
                    { phoneNumber: dto.phoneNumber },
                    { email: dto.email },
                ],
            },
        });

        if (conflict) {
            throw new BadRequestException('National ID, phone number, or email is already linked to another seller.');
        }

        // 4. Create request
        return this.prisma.coinSellerRequest.create({
            data: {
                userId: dto.userId,
                fullName: dto.fullName,
                nationalId: dto.nationalId,
                phoneNumber: dto.phoneNumber,
                email: dto.email,
            },
        });
    }


    // Admin: Get all pending requests
    async getPendingRequests() {
        return this.prisma.coinSellerRequest.findMany({
            where: { status: RequestStatus.PENDING },
            include: { user: true },
        });
    }

    // Admin: Approve a request
    async approveRequest(id: string) {
        const request = await this.prisma.coinSellerRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Request not found');

        if (request.status !== RequestStatus.PENDING)
            throw new BadRequestException('Request already reviewed');

        // 1. Create CoinSeller record
        await this.coinSellerService.createSeller({
            userId: request.userId,
            fullName: request.fullName,
            nationalId: request.nationalId,
            phoneNumber: request.phoneNumber,
            email: request.email,
        });

        // 2. Delete the request, because it's no longer needed
        await this.prisma.coinSellerRequest.delete({
            where: { id },
        });

        return { message: 'Request approved and deleted' };
    }

    // Admin: Reject a request by deleting it
    async rejectRequest(id: string) {
        const request = await this.prisma.coinSellerRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Request not found');

        if (request.status !== RequestStatus.PENDING)
            throw new BadRequestException('Request already reviewed');

        return this.prisma.coinSellerRequest.delete({
            where: { id },
        });
    }
    // Admin or user: view request details
    async getRequestByUser(userId: string) {
        return this.prisma.coinSellerRequest.findUnique({
            where: { userId },
        });
    }
}
