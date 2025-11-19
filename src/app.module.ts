/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { MiddlewareConsumer, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { ProfileModule } from './profile/profile.module';
import * as morgan from 'morgan';

import { FriendsModule } from './friends/friends.module';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardModule } from './dashboard/dashboard.module';
import { PaymentModule } from './payment/payment.module';
import { VipModule } from './vip/vip.module';
import { AnnouncementModule } from './announcement/announcement.module';
import { UserModuleModule } from './user_module/user_module.module';
import { MessageService } from './message/message.service';
import { GiftsModule } from './gifts/gifts.module';
import { CollectionsModule } from './collections/collections.module';
import { SettingsModule } from './settings/settings.module';
import { CoinSellerModule } from './coin-seller/coin-seller.module';
import { CoinSellerController } from './coin-seller/coin-seller.controller';
import { CoinSellerService } from './coin-seller/coin-seller.service';
import { CoinSellerRequestModule } from './coin-seller-request/coin-seller-request.module';



@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    PrismaModule,
    ProfileModule,
    FriendsModule,
    DashboardModule,
    PaymentModule,
    VipModule,
    AnnouncementModule,
    UserModuleModule,
    GiftsModule,
    CollectionsModule,
    SettingsModule,
    CoinSellerModule,
    CoinSellerRequestModule


  ],
  controllers: [DashboardController, CoinSellerController],
  providers: [MessageService, CoinSellerService],


})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(morgan('dev')).forRoutes('*');
  }
}