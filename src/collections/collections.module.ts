import { Module } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';

@Module({
  providers: [CollectionsService],
  controllers: [CollectionsController]
})
export class CollectionsModule {}
