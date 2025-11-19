import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaService } from 'src/prisma/prisma.service'; // if you use Prisma
import { UserModuleModule } from 'src/user_module/user_module.module';

@Module({
  imports: [UserModuleModule],
  controllers: [DashboardController],
  providers: [DashboardService, PrismaService],
  exports: [DashboardService], // optional, for sharing with other modules
})
export class DashboardModule { }