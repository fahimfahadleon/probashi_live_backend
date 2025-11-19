import { Module } from '@nestjs/common';
import { CoinSellerRequestController } from './coin-seller-request.controller';
import { CoinSellerRequestService } from './coin-seller-request.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CoinSellerService } from 'src/coin-seller/coin-seller.service';

@Module({
  controllers: [CoinSellerRequestController],
  providers: [CoinSellerRequestService, PrismaService, CoinSellerService],
})
export class CoinSellerRequestModule { }
