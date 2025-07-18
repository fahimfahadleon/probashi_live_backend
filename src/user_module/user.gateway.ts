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
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class UserGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    // Map userId => { socket: Socket, sessionId?: string }
    private activeUsers: Map<string, { socket: Socket; sessionId?: string }> = new Map();

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
                    await this.handleUserLeavingSession(userId, sessionId);
                }
                break;
            }
        }
    }

    private async handleUserLeavingSession(userId: string, sessionId: string) {
        const liveUser = await this.prisma.liveUser.findFirst({
            where: { userId, leftAt: null },
        });
        if (!liveUser) return;

        await this.prisma.liveUser.update({
            where: { id: liveUser.id },
            data: { leftAt: new Date() },
        });

        if (liveUser.isHost) {
            await this.prisma.liveSession.update({
                where: { id: sessionId },
                data: { endedAt: new Date() },
            });
        }

        const updatedSession = await this.prisma.liveSession.findUnique({
            where: { id: sessionId },
            include: {
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
            },
        });

        this.server.to(sessionId).emit('live_ended', updatedSession);
    }

    @SubscribeMessage('get_active_live_sessions')
    async handleGetActiveLiveSessions(@ConnectedSocket() client: Socket) {
        // Fetch all live sessions where endedAt is null, include all related data
        const activeSessions = await this.prisma.liveSession.findMany({
            where: { endedAt: null },
            include: {
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
            },
        });
        console.log(activeSessions);

        // Emit the list back to the client
        client.emit('active_live_sessions', activeSessions);
    }

    @SubscribeMessage('go_live')
    async handleGoLive(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; rtmpUrl: string },
    ) {
        const { userId } = data;

        // Step 1: Create the live session (empty for now)
        const liveSession = await this.prisma.liveSession.create({
            data: {},
        });

        // Step 2: Create LiveUser record as host with hostSessionId
        await this.prisma.liveUser.create({
            data: {
                userId,
                hostSessionId: liveSession.id,
                joinedAt: new Date(),
                isHost: true,
                role: 'host',
            },
        });

        // Step 3: Reload session with all related data (including host user)
        const fullSession = await this.prisma.liveSession.findUnique({
            where: { id: liveSession.id },
            include: {
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
            },
        });

        // Step 4: Track session and join room
        const userData = this.activeUsers.get(userId);
        if (userData) {
            userData.sessionId = liveSession.id;
            this.activeUsers.set(userId, userData);

            client.join(liveSession.id);
        }

        // Step 5: Emit event
        client.emit('live_started', fullSession);
    }

    // Participant joins existing session
    @SubscribeMessage('join_session')
    async handleJoinSession(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; sessionId: string },
    ) {
        const { userId, sessionId } = data;

        client.join(sessionId);

        // Check existing participant record for this session
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

        this.server.to(sessionId).emit('participant_joined', { userId, role: 'participant' });

        // Send updated session
        const updatedSession = await this.prisma.liveSession.findUnique({
            where: { id: sessionId },
            include: {
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
            },
        });
        this.server.to(sessionId).emit('session_updated', updatedSession);
    }

    // Audience joins session (read-only, but can comment and gift)
    @SubscribeMessage('join_audience')
    async handleJoinAudience(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; sessionId: string },
    ) {
        const { userId, sessionId } = data;

        client.join(sessionId);

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

        this.server.to(sessionId).emit('audience_joined', { userId, role: 'audience' });

        const updatedSession = await this.prisma.liveSession.findUnique({
            where: { id: sessionId },
            include: {
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
            },
        });
        this.server.to(sessionId).emit('session_updated', updatedSession);
    }

    @SubscribeMessage('send_comment')
    async handleSendComment(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; sessionId: string; message: string },
    ) {
        const { userId, sessionId, message } = data;

        if (!message.trim()) return; // Ignore empty messages

        // Find the active LiveUser (host, participant, or audience)
        const liveUser = await this.prisma.liveUser.findFirst({
            where: {
                userId,
                leftAt: null,
                OR: [
                    { hostSessionId: sessionId },
                    { participantSessionId: sessionId },
                    { audienceSessionId: sessionId },
                ],
            },
        });

        if (!liveUser) {
            console.warn(`[send_comment] No active LiveUser found for ${userId} in session ${sessionId}`);
            return;
        }

        // Create and emit the comment (with user info)
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

        this.server.to(sessionId).emit('new_comment', comment);
    }


    @SubscribeMessage('leave_live')
    async handleLeaveLive(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; sessionId: string },
    ) {
        const { userId, sessionId } = data;

        const liveUser = await this.prisma.liveUser.findFirst({
            where: { userId, leftAt: null },
        });

        if (!liveUser) {
            client.leave(sessionId);
            this.activeUsers.delete(userId);
            return;
        }

        await this.prisma.liveUser.update({
            where: { id: liveUser.id },
            data: { leftAt: new Date() },
        });

        const isHost = liveUser.isHost && liveUser.hostSessionId === sessionId;

        if (isHost) {
            const updatedSession = await this.prisma.liveSession.update({
                where: { id: sessionId },
                data: { endedAt: new Date() },
                include: {
                    hosts: { include: { user: true } },
                    participants: { include: { user: true } },
                    audience: { include: { user: true } },
                    comments: true,
                    gifts: true,
                },
            });

            this.server.to(sessionId).emit('live_ended', updatedSession);
        }

        // Remove sessionId from activeUsers map
        const userSocketData = this.activeUsers.get(userId);
        if (userSocketData) {
            delete userSocketData.sessionId;
            this.activeUsers.set(userId, userSocketData);
        }

        client.leave(sessionId);

        // Notify others if participant or audience left
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
}
