/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// auth.service.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// auth.service.ts
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {


    private googleClient;

    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private configService: ConfigService,
    ) {
        this.googleClient = new OAuth2Client(configService.get<string>('GOOGLE_CLIENT_ID'));
    }


    async createAdmin(email: string, password: string, name?: string) {
        const existing = await this.prisma.admin.findUnique({ where: { email } });
        if (existing) throw new ConflictException('Admin with this email already exists');

        const hashed = await bcrypt.hash(password, 10);

        const admin = await this.prisma.admin.create({
            data: {
                email,
                password: hashed,
                name,
            },
        });

        return admin;
    }

    //   async generateHash() {
    //   const password = '64742812';
    //   const saltRounds = 10;

    //   const hash = await bcrypt.hash(password, saltRounds);
    //   console.log('Generated bcrypt hash:', hash);
    // }

    async validateAdmin(email: string, password: string) {
        const admin = await this.prisma.admin.findUnique({ where: { email } });
        if (!admin) throw new UnauthorizedException('Invalid credentials');

        const passwordValid = await bcrypt.compare(password, admin.password);
        if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

        return admin;
    }

    async login(email: string, password: string) {


        const admin = await this.validateAdmin(email, password);

        const payload = { sub: admin.id, email: admin.email, role: 'admin' };
        const token = this.jwtService.sign(payload, {
            secret: this.configService.get<string>('ADMIN_SECRET'),
            expiresIn: '7d',
        });

        return {
            access_token: token,
        };
    }





    whatsappLogin(accessToken: string) {
        throw new Error('Method not implemented.');
    }

    async googleLogin(idToken: string) {

        // this.createAdmin("fahimfahadleon6474@gmail.com", "64742812", "fahim fahad leon");


        // 1. Verify the Google ID token
        const ticket = await this.googleClient.verifyIdToken({
            idToken,
            audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
        });

        const payload = ticket.getPayload();

        if (!payload || !payload.sub) {
            throw new UnauthorizedException('Invalid Google token');
        }

        const googleId = payload.sub;
        const email = payload.email || '';
        const name = payload.name || 'Unnamed';
        const profilePic = payload.picture || '';

        // 2. Check if user exists
        let user = await this.prisma.user.findUnique({
            where: { id: googleId },
        });

        // 3. If not, create user
        if (!user) {
            user = await this.prisma.user.create({
                data: {
                    id: googleId,
                    name,
                    profilePic,
                    bio: '',
                    coin: 0,
                    diamond: 0,
                    level: 1,
                    vipStatus: false,
                    settings: {},
                    extra: {},
                },
            });
        }

        // 4. Sign a JWT token
        const tokenPayload = {
            sub: user.id,
            email,
        };

        const token = this.jwtService.sign(tokenPayload, {
            secret: this.configService.get<string>('JWT_SECRET'),
            expiresIn: '7d',
        });

        // return {
        //     accessToken,
        //     user,
        // };

        return {
            accessToken: token
        };
    }

    async facebookLogin(accessToken: string) {
        try {
            // 1. Verify the access token with Facebook
            const fbResponse = await axios.get(
                `https://graph.facebook.com/me`,
                {
                    params: {
                        access_token: accessToken,
                        fields: 'id,name,email,picture',
                    },
                }
            );

            const { id: fbId, name, email, picture } = fbResponse.data;

            if (!fbId) {
                throw new UnauthorizedException('Invalid Facebook token');
            }

            // 2. Check if user exists
            let user = await this.prisma.user.findUnique({
                where: { id: fbId },
            });

            // 3. If not, create user
            if (!user) {
                user = await this.prisma.user.create({
                    data: {
                        id: fbId,
                        name,
                        profilePic: picture?.data?.url || '',
                        bio: '',
                        coin: 0,
                        diamond: 0,
                        level: 1,
                        vipStatus: false,
                        settings: {},
                        extra: {},
                    },
                });
            }

            // 4. Generate JWT
            const tokenPayload = {
                sub: user.id,
                email: email || '',
            };

            const token = await this.jwtService.signAsync(tokenPayload, {
                expiresIn: '10080m',
                secret: this.configService.get<string>('JWT_SECRET'),
            });

            return { accessToken: token };
        } catch (err) {
            throw new UnauthorizedException('Facebook login failed');
        }
    }
}
