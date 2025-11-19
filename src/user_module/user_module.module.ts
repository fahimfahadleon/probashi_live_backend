// user.module.ts
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { UserGateway } from './user.gateway';
import { ActiveUserService } from './active-user.service';




@Module({
    imports: [AuthModule],  // to get JwtService
    providers: [UserGateway, ActiveUserService],
    exports: [ActiveUserService, UserGateway],  // export to use in other modules
})
export class UserModuleModule { }