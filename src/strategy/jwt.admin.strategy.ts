import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class JwtAdminStrategy
    extends PassportStrategy(Strategy, 'jwtA',) {
    constructor(config: ConfigService, private prisma: PrismaService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: config.get('ADMIN_SECRET')!,
        });
    }
    async validate(payload: { sub: string; email: string; role: string }) {
        if (payload.role !== 'admin') {
            throw new UnauthorizedException('Access restricted to admins');
        }

        const admin = await this.prisma.admin.findUnique({
            where: { id: payload.sub },
        });

        if (!admin) {
            throw new UnauthorizedException('Admin not found');
        }

        return { ...admin, role: 'admin' };
    }
}