import { Module } from '@nestjs/common';
import { GiftController } from './gifts.controller';
import { GiftsService } from './gifts.service';

@Module({
  controllers: [GiftController],
  providers: [GiftsService]
})
export class GiftsModule { }
