import {
    WebSocketGateway,
    OnGatewayConnection,
    OnGatewayDisconnect,
    WebSocketServer,
    SubscribeMessage,
    ConnectedSocket,
    MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, UsePipes, ValidationPipe } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

// --- DTOs ---
class SendGiftDto {
    @IsString()
    @IsNotEmpty()
    toUserId: string;

    @IsString()
    @IsNotEmpty()
    sessionId: string;

    @IsString()
    @IsNotEmpty()
    giftId: string;
}

class SendCommentDto {
    @IsString()
    @IsNotEmpty()
    userId: string;

    @IsString()
    @IsNotEmpty()
    sessionId: string;

    @IsString()
    @IsNotEmpty()
    message: string;
}

class LeaveLiveDto {
    @IsString()
    @IsNotEmpty()
    userId: string;

    @IsString()
    @IsNotEmpty()
    sessionId: string;
}

class SendMessageDto {
    @IsString()
    @IsNotEmpty()
    senderId: string;

    @IsString()
    @IsNotEmpty()
    receiverId: string;

    @IsString()
    @IsNotEmpty()
    content: string;
}

class GetChatHistoryDto {
    @IsString()
    @IsNotEmpty()
    userId: string;

    @IsString()
    @IsNotEmpty()
    otherUserId: string;

    @IsOptional()
    @IsNumber()
    page?: number;

    @IsOptional()
    @IsNumber()
    limit?: number;
}

class GetChatInboxDto {
    @IsString()
    @IsNotEmpty()
    userId: string;
}

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class UserGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private activeUsers: Map<string, { socket: Socket; sessionId?: string }> = new Map();

    // Reusable Prisma include for full session data
    private readonly fullSessionInclude = {
        hosts: { include: { user: true } },
        participants: { include: { user: true } },
        audience: { include: { user: true } },
        comments: { include: { liveUser: { include: { user: true } } } },
        gifts: {
            include: {
                fromUser: { include: { user: true } },
                toUser: { include: { user: true } },
            },
        },
    };

    constructor(private readonly jwtService: JwtService, private prisma: PrismaService) { }

    async handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth.token;
            if (!token) throw new UnauthorizedException('No token provided');

            const payload = this.jwtService.verify(token, {
                secret: process.env.JWT_SECRET || 'your_jwt_secret',
            });

            if (!payload?.sub) throw new UnauthorizedException('Invalid token payload');

            this.activeUsers.set(payload.sub, { socket: client });
            console.log(`User connected: ${payload.sub} (socket id: ${client.id})`);

            client.emit('connected', {
                message: 'Welcome! Socket connection established.',
                userId: payload.sub,
            });
        } catch (err) {
            console.log('Socket connection error:', err.message);
            client.disconnect(true);
        }
    }

    async handleDisconnect(client: Socket) {
        for (const [userId, { socket, sessionId }] of this.activeUsers.entries()) {
            if (socket.id === client.id) {
                this.activeUsers.delete(userId);
                console.log(`User disconnected: ${userId} (socket id: ${client.id})`);

                if (sessionId) {
                    try {
                        const liveUser = await this.prisma.liveUser.findFirst({
                            where: { userId, leftAt: null },
                        });

                        if (liveUser) {
                            const isHost = liveUser.isHost;

                            if (isHost) {
                                // Emit live_ended BEFORE updating leftAt and endedAt
                                const updatedSession = await this.prisma.liveSession.findUnique({
                                    where: { id: sessionId },
                                    include: this.fullSessionInclude,
                                });

                                this.server.to(sessionId).emit('live_ended', updatedSession);

                                await this.prisma.liveSession.update({
                                    where: { id: sessionId },
                                    data: { endedAt: new Date() },
                                });
                            }

                            await this.prisma.liveUser.update({
                                where: { id: liveUser.id },
                                data: { leftAt: new Date() },
                            });

                            if (!isHost) {
                                const roleLeft =
                                    liveUser.role === 'participant'
                                        ? 'participant_left'
                                        : liveUser.role === 'audience'
                                            ? 'audience_left'
                                            : 'unknown_role_left';

                                this.server.to(sessionId).emit(roleLeft, { userId });
                            }
                        }
                    } catch (error) {
                        console.error('Error handling disconnect cleanup:', error);
                    }
                }
                break;
            }
        }
    }

    private async handleUserLeavingSession(userId: string, sessionId: string) {
        try {
            const liveUser = await this.prisma.liveUser.findFirst({
                where: { userId, leftAt: null },
            });

            if (!liveUser) return;

            const isHost = liveUser.isHost;

            if (isHost) {
                const updatedSession = await this.prisma.liveSession.findUnique({
                    where: { id: sessionId },
                    include: this.fullSessionInclude,
                });

                this.server.to(sessionId).emit('live_ended', updatedSession);

                await this.prisma.liveSession.update({
                    where: { id: sessionId },
                    data: { endedAt: new Date() },
                });
            }

            await this.prisma.liveUser.update({
                where: { id: liveUser.id },
                data: { leftAt: new Date() },
            });
        } catch (error) {
            console.error('Error in handleUserLeavingSession:', error);
        }
    }

    // Helper for LiveUser lookup by userId and sessionId
    private async findLiveUserInSession(userId: string, sessionId: string) {
        return this.prisma.liveUser.findFirst({
            where: {
                userId,
                leftAt: null,
                OR: [
                    { hostSessionId: sessionId },
                    { participantSessionId: sessionId },
                    { audienceSessionId: sessionId },
                ],
            },
            include: { user: true },
        });
    }

    @SubscribeMessage('send_gift')
    @UsePipes(new ValidationPipe({ transform: true }))
    async handleSendGift(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: SendGiftDto,
    ) {
        // Derive fromUserId from socket, not from client data
        let fromUserId: string | undefined;
        for (const [userId, { socket }] of this.activeUsers.entries()) {
            if (socket.id === client.id) {
                fromUserId = userId;
                break;
            }
        }
        if (!fromUserId) {
            client.emit('error', { code: 'NOT_AUTHENTICATED', message: 'Sender not authenticated.' });
            return;
        }

        try {
            const { sessionId, giftId, toUserId } = data;

            // 1. Validate session
            const session = await this.prisma.liveSession.findUnique({
                where: { id: sessionId },
            });

            if (!session || session.endedAt) {
                client.emit('error', { code: 'SESSION_INACTIVE', message: 'Live session is not active.' });
                return;
            }

            // 2. Use the helper for LiveUser lookup
            const fromLiveUser = await this.findLiveUserInSession(fromUserId, sessionId);
            const toLiveUser = await this.findLiveUserInSession(toUserId, sessionId);

            if (!fromLiveUser || !toLiveUser) {
                console.warn('[send_gift] One of the users is not active in this session.', { fromUserId, toUserId, sessionId });
                client.emit('error', {
                    code: 'USER_NOT_ACTIVE',
                    message: 'One of the users is not active in this session.',
                });
                return;
            }

            // 3. Get gift
            const gift = await this.prisma.gift.findUnique({
                where: { id: giftId },
            });

            if (!gift) {
                console.warn('[send_gift] Gift not found', { giftId });
                client.emit('error', { code: 'GIFT_NOT_FOUND', message: 'Gift not found.' });
                return;
            }

            // 4. Run transaction: verify diamonds, deduct, add, create gift
            await this.prisma.$transaction(async (prisma) => {
                // Reload users inside transaction
                const fromUser = await prisma.user.findUnique({ where: { id: fromLiveUser.user.id } });
                const toUser = await prisma.user.findUnique({ where: { id: toLiveUser.user.id } });

                if (!fromUser || !toUser) {
                    console.error('[send_gift] Users not found in transaction', { fromUserId: fromLiveUser.user.id, toUserId: toLiveUser.user.id });
                    throw new Error('Users not found');
                }

                if (fromUser.diamond < gift.price) {
                    console.warn('[send_gift] Insufficient diamonds', { fromUserId: fromUser.id, diamond: fromUser.diamond, price: gift.price });
                    throw new Error('Insufficient diamonds');
                }

                // Deduct diamonds from sender
                await prisma.user.update({
                    where: { id: fromUser.id },
                    data: { diamond: { decrement: gift.price } },
                });

                // Add diamonds to receiver
                await prisma.user.update({
                    where: { id: toUser.id },
                    data: { diamond: { increment: gift.price } },
                });

                // Create the liveGift record
                await prisma.liveGift.create({
                    data: {
                        fromUserId: fromLiveUser.id,
                        toUserId: toLiveUser.id,
                        sessionId,
                        giftId,
                    },
                });
            });

            // 5. Emit to session (send gift info including fromUser and toUser details)
            this.server.to(sessionId).emit('gift_received', {
                sessionId,
                gift,
                fromUser: fromLiveUser.user,
                toUser: toLiveUser.user,
            });

        } catch (error: any) {
            console.error('Error in handleSendGift:', error);
            let code = 'SEND_GIFT_FAILED';
            let message = 'Failed to send gift.';
            if (error.message === 'Insufficient diamonds') {
                code = 'INSUFFICIENT_DIAMONDS';
                message = 'You do not have enough diamonds to send this gift.';
            } else if (error.message === 'Users not found') {
                code = 'USER_NOT_FOUND';
                message = 'Sender or receiver not found.';
            }
            client.emit('error', { code, message });
        }
    }

    @SubscribeMessage('get_active_live_sessions')
    async handleGetActiveLiveSessions(@ConnectedSocket() client: Socket) {
        try {
            const activeSessions = await this.prisma.liveSession.findMany({
                where: { endedAt: null },
                include: this.fullSessionInclude,
            });

            client.emit('active_live_sessions', activeSessions);
        } catch (error) {
            console.error('Error fetching active live sessions:', error);
        }
    }

    @SubscribeMessage('go_live')
    async handleGoLive(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; rtmpUrl: string },
    ) {
        try {
            const liveSession = await this.prisma.liveSession.create({
                data: {},
            });

            await this.prisma.liveUser.create({
                data: {
                    userId: data.userId,
                    hostSessionId: liveSession.id,
                    joinedAt: new Date(),
                    isHost: true,
                    role: 'host',
                },
            });

            const fullSession = await this.prisma.liveSession.findUnique({
                where: { id: liveSession.id },
                include: this.fullSessionInclude,
            });

            const userData = this.activeUsers.get(data.userId);
            if (userData) {
                userData.sessionId = liveSession.id;
                this.activeUsers.set(data.userId, userData);

                client.join(liveSession.id);

                console.log(`Socket ${client.id} joined room ${liveSession.id}`);
            }

            client.emit('live_started', fullSession);
        } catch (error) {
            console.error('Error in handleGoLive:', error);
        }
    }

    @SubscribeMessage('join_session')
    async handleJoinSession(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; sessionId: string },
    ) {
        try {
            const { userId, sessionId } = data;

            client.join(sessionId);
            console.log(`Socket ${client.id} joined room ${sessionId}`);

            const existingLiveUser = await this.prisma.liveUser.findFirst({
                where: {
                    userId,
                    participantSessionId: sessionId,
                    leftAt: null,
                },
            });

            if (existingLiveUser) {
                await this.prisma.liveUser.update({
                    where: { id: existingLiveUser.id },
                    data: {
                        leftAt: null,
                        joinedAt: new Date(),
                        isHost: false,
                        role: 'participant',
                    },
                });
            } else {
                await this.prisma.liveUser.create({
                    data: {
                        userId,
                        participantSessionId: sessionId,
                        joinedAt: new Date(),
                        isHost: false,
                        role: 'participant',
                    },
                });
            }

            const userSocketData = this.activeUsers.get(userId);
            if (userSocketData) {
                userSocketData.sessionId = sessionId;
                this.activeUsers.set(userId, userSocketData);
            }

            this.server.in(sessionId).emit('participant_joined', { userId, role: 'participant' });

            const updatedSession = await this.prisma.liveSession.findUnique({
                where: { id: sessionId },
                include: this.fullSessionInclude,
            });
            this.server.in(sessionId).emit('session_updated', updatedSession);
        } catch (error) {
            console.error('Error in handleJoinSession:', error);
        }
    }

    @SubscribeMessage('join_audience')
    async handleJoinAudience(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; sessionId: string },
    ) {
        try {
            const { userId, sessionId } = data;

            client.join(sessionId);
            console.log(`Socket ${client.id} joined room ${sessionId}`);

            const existingAudience = await this.prisma.liveUser.findFirst({
                where: {
                    userId,
                    audienceSessionId: sessionId,
                    leftAt: null,
                },
            });

            if (existingAudience) {
                await this.prisma.liveUser.update({
                    where: { id: existingAudience.id },
                    data: {
                        leftAt: null,
                        joinedAt: new Date(),
                        role: 'audience',
                    },
                });
            } else {
                await this.prisma.liveUser.create({
                    data: {
                        userId,
                        audienceSessionId: sessionId,
                        joinedAt: new Date(),
                        isHost: false,
                        role: 'audience',
                    },
                });
            }

            const userSocketData = this.activeUsers.get(userId);
            if (userSocketData) {
                userSocketData.sessionId = sessionId;
                this.activeUsers.set(userId, userSocketData);
            }

            this.server.in(sessionId).emit('audience_joined', { userId, role: 'audience' });

            const updatedSession = await this.prisma.liveSession.findUnique({
                where: { id: sessionId },
                include: this.fullSessionInclude,
            });
            this.server.in(sessionId).emit('session_updated', updatedSession);
        } catch (error) {
            console.error('Error in handleJoinAudience:', error);
        }
    }

    @SubscribeMessage('send_comment')
    @UsePipes(new ValidationPipe({ transform: true }))
    async handleSendComment(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: SendCommentDto,
    ) {
        try {
            const { userId, sessionId, message } = data;

            if (!message.trim()) return;

            // Use the helper for LiveUser lookup
            const liveUser = await this.findLiveUserInSession(userId, sessionId);

            if (!liveUser) {
                console.warn(`[send_comment] No active LiveUser found for ${userId} in session ${sessionId}`);
                return;
            }

            const comment = await this.prisma.liveComment.create({
                data: {
                    liveUserId: liveUser.id,
                    message,
                    sessionId,
                },
                include: {
                    liveUser: { include: { user: true } },
                },
            });

            this.server.in(sessionId).emit('new_comment', comment);
            console.log(`[EMIT] new_comment to ${sessionId}:`, comment);
        } catch (error) {
            console.error('Error in handleSendComment:', error);
        }
    }

    @SubscribeMessage('leave_live')
    @UsePipes(new ValidationPipe({ transform: true }))
    async handleLeaveLive(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: LeaveLiveDto,
    ) {
        try {
            const { userId, sessionId } = data;

            // Use the helper for LiveUser lookup
            const liveUser = await this.findLiveUserInSession(userId, sessionId);

            if (!liveUser) {
                client.leave(sessionId);
                this.activeUsers.delete(userId);
                return;
            }

            const isHost = liveUser.isHost && liveUser.hostSessionId === sessionId;

            if (isHost) {
                const updatedSession = await this.prisma.liveSession.findUnique({
                    where: { id: sessionId },
                    include: this.fullSessionInclude,
                });

                this.server.in(sessionId).emit('live_ended', updatedSession);

                await this.prisma.liveSession.update({
                    where: { id: sessionId },
                    data: { endedAt: new Date() },
                });
            }

            await this.prisma.liveUser.update({
                where: { id: liveUser.id },
                data: { leftAt: new Date() },
            });

            const userSocketData = this.activeUsers.get(userId);
            if (userSocketData) {
                userSocketData.sessionId = null;
                this.activeUsers.set(userId, userSocketData);
            }

            client.leave(sessionId);
        } catch (error) {
            console.error('Error in handleLeaveLive:', error);
        }
    }
}
