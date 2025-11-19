import { Module } from '@nestjs/common';
import { CoinSellerController } from './coin-seller.controller';
import { CoinSellerService } from './coin-seller.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
    controllers: [CoinSellerController],
    providers: [CoinSellerService, PrismaService],
})
export class CoinSellerModule { }
