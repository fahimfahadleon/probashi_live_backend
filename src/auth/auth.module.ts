import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtAdminStrategy, JwtStrategy } from 'src/strategy';
import { AuthController } from './auth.controller';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
  ],
  providers: [AuthService, JwtStrategy, JwtAdminStrategy],
  controllers: [AuthController],
  exports: [JwtModule]
})
export class AuthModule { }
