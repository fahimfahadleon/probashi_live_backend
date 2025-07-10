// user.module.ts
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { UserGateway } from './user.gateway';

@Module({
    imports: [AuthModule],  // to get JwtService
    providers: [UserGateway],
    exports: [UserGateway],
})
export class UserModuleModule { }