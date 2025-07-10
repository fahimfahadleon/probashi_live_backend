import { Module } from '@nestjs/common';
import { VipService } from './vip.service';
import { VipController } from './vip.controller';

@Module({
  providers: [VipService],
  controllers: [VipController]
})
export class VipModule {}
