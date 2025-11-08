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
import { subscribe } from 'diagnostics_channel';
import { MessageService } from 'src/message/message.service';


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

class InviteUserDto {
    @IsString()
    @IsNotEmpty()
    fromUserId: string;

    @IsString()
    @IsNotEmpty()
    toUserId: string;

    @IsString()
    @IsNotEmpty()
    sessionId: string;
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
    // Notify a user that their join request was accepted and they can join the live session
    @SubscribeMessage('join_request_accepted')
    async handleJoinRequestAccepted(
        @ConnectedSocket() client: Socket,
        @MessageBody()
        data: { userId: string; sessionId: string; fromUser: string },
    ) {
        // Forward the original payload to the target user as-is.
        const { userId } = data;
        const targetUser = this.activeUsers.get(userId);
        if (!targetUser) {
            client.emit('error', { code: 'USER_NOT_CONNECTED', message: 'Target user is not connected' });
            return;
        }

        // Ensure the client receives at least a message field if not provided

        targetUser.socket.emit('join_request_accepted', data);

        // Optional: log for server-side trace
    }
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

    constructor(private readonly jwtService: JwtService, private prisma: PrismaService,) { }

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

                                //todo ekhane somossa ase. null pay ekta value

                                this.server.to(sessionId).emit(roleLeft, { userId });
                            }

                            const updatedSession = await this.prisma.liveSession.findUnique({
                                where: { id: sessionId },
                                include: this.fullSessionInclude,
                            });

                            this.server.to(sessionId).emit('session_updated', updatedSession);
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







    @SubscribeMessage('invite_to_join_live')
    @UsePipes(new ValidationPipe({ transform: true }))
    async handleInviteUser(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: InviteUserDto,
    ) {
        const { fromUserId, toUserId, sessionId } = data;

        // Check that both users are connected
        const fromUser = this.activeUsers.get(fromUserId);
        const toUser = this.activeUsers.get(toUserId);

        if (!fromUser || !toUser) {
            client.emit('error', { code: 'USER_NOT_CONNECTED', message: 'One of the users is not connected' });
            return;
        }

        try {
            // Optional: verify that inviter is in the session
            const inviterLiveUser = await this.findLiveUserInSession(fromUserId, sessionId);
            if (!inviterLiveUser) {
                client.emit('error', { code: 'INVITER_NOT_IN_SESSION', message: 'You are not in the session' });
                return;
            }

            // Send an invite to the receiver
            toUser.socket.emit('live_invite', {
                fromUserId,
                toUserId,
                sessionId,
                message: `You have been invited to join a live session.`,
            });
        } catch (error) {
            console.error('Error in handleInviteUser:', error);
            client.emit('error', { code: 'INVITE_FAILED', message: 'Failed to send invite' });
        }
    }

    @SubscribeMessage('invite_accepted')
    async handleInviteAccepted(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { fromUserId: string, userId: string; sessionId: string },
    ) {
        const { fromUserId, userId, sessionId } = data;
        const fromUser = this.activeUsers.get(fromUserId);
        if (!fromUser) {
            client.emit('error', { code: 'USER_NOT_CONNECTED', message: 'One of the users is not connected' });
            return;
        }
        // You can add validation or DB logic here if needed

        // Notify the inviter or the session that invite was accepted
        fromUser?.socket.emit('invite_accepted', {
            userId,
            sessionId,
            message: `${userId} accepted the invite`,
        });

        console.log(`Invite accepted by ${userId} for session ${sessionId}`);
    }





    @SubscribeMessage('get_friends')
    async handleGetFriends(@ConnectedSocket() client: Socket) {
        try {
            // Extract userId from activeUsers map by socket id
            let userId: string | undefined;
            for (const [uid, { socket }] of this.activeUsers.entries()) {
                if (socket.id === client.id) {
                    userId = uid;
                    break;
                }
            }
            if (!userId) {
                client.emit('error', { code: 'NOT_AUTHENTICATED', message: 'User not authenticated' });
                return;
            }

            // Step 1: Get IDs of users current user follows
            const following = await this.prisma.follow.findMany({
                where: { followerId: userId },
                select: { followingId: true },
            });
            const followingIds = following.map(f => f.followingId);
            if (followingIds.length === 0) {
                client.emit('friends_list', []); // no friends
                return;
            }

            // Step 2: Find users who follow back the current user (mutual)
            const mutualFollows = await this.prisma.follow.findMany({
                where: {
                    followerId: { in: followingIds },
                    followingId: userId,
                },
                select: {
                    follower: {
                        select: {
                            id: true,
                            name: true,
                            profilePic: true,
                            vipStatus: true,
                            settings: true,
                            level: true,
                        },
                    },
                },
            });

            // Step 3: Extract users
            const friends = mutualFollows.map(m => m.follower);


            // Emit the friend list to the client
            client.emit('friends_list', friends);
        } catch (error) {
            console.error('Error in handleGetFriends:', error);
            client.emit('error', { code: 'GET_FRIENDS_FAILED', message: 'Failed to get friends' });
        }
    }
    @SubscribeMessage('invite_declined')
    async handleInviteDeclined(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { fromUserId: string; toUserId: string; sessionId: string },
    ) {
        const { fromUserId, toUserId, sessionId } = data;

        const inviter = this.activeUsers.get(fromUserId);

        if (!inviter) {
            console.warn(`[invite_declined] Inviter (${fromUserId}) not connected.`);
            client.emit('error', {
                code: 'INVITER_NOT_CONNECTED',
                message: 'The inviter is not currently connected.',
            });
            return;
        }

        // Notify only the host/inviter
        inviter.socket.emit('invite_canceled', {
            fromUserId,
            toUserId,
            sessionId,
            message: `${toUserId} declined your invitation.`,
        });

        console.log(`Invite declined: ${toUserId} declined invitation from ${fromUserId} in session ${sessionId}`);
    }


    async createMessage(senderId: string, receiverId: string, content: string) {
        return this.prisma.message.create({
            data: { senderId, receiverId, content },
        });
    }

    async getChatHistory(userId: string, otherUserId: string) {
        return this.prisma.message.findMany({
            where: {
                OR: [
                    { senderId: userId, receiverId: otherUserId },
                    { senderId: otherUserId, receiverId: userId },
                ],
            },
            orderBy: { createdAt: 'asc' },
        });
    }





    @SubscribeMessage('send_message')
    async handleSendMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() dto: SendMessageDto,
    ) {
        const { senderId, receiverId, content } = dto;

        const message = await this.createMessage(senderId, receiverId, content);

        // Notify both users
        const sender = this.activeUsers.get(senderId);
        const receiver = this.activeUsers.get(receiverId);

        if (receiver) {
            receiver.socket.emit('new_message', message);
        }

        if (sender) {
            sender.socket.emit('new_message', message);
        }
    }

    @SubscribeMessage('get_chat_history')
    async handleGetChatHistory(
        @ConnectedSocket() client: Socket,
        @MessageBody() dto: GetChatHistoryDto,
    ) {
        const { userId, otherUserId, page = 1, limit = 20 } = dto;

        const [total, messages] = await this.prisma.$transaction([
            this.prisma.message.count({
                where: {
                    OR: [
                        { senderId: userId, receiverId: otherUserId },
                        { senderId: otherUserId, receiverId: userId },
                    ],
                },
            }),
            this.prisma.message.findMany({
                where: {
                    OR: [
                        { senderId: userId, receiverId: otherUserId },
                        { senderId: otherUserId, receiverId: userId },
                    ],
                },
                orderBy: { createdAt: 'asc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);

        client.emit('chat_history', {
            userId,
            otherUserId,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            messages,
        });
    }



    @SubscribeMessage('get_chat_inbox')
    async handleGetChatInbox(
        @ConnectedSocket() client: Socket,
        @MessageBody() dto: { userId: string },
    ) {
        const userId = dto.userId;

        // Get all messages where the user is either sender or receiver
        const messages = await this.prisma.message.findMany({
            where: {
                OR: [{ senderId: userId }, { receiverId: userId }],
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        const chatMap = new Map<string, typeof messages[0]>();

        // Group by conversation partner (latest message per chat)
        for (const msg of messages) {
            const partnerId = msg.senderId === userId ? msg.receiverId : msg.senderId;
            if (!chatMap.has(partnerId)) {
                chatMap.set(partnerId, msg); // Only store the latest
            }
        }

        const inbox: ChatInboxEntry[] = [];

        for (const [partnerId, msg] of chatMap.entries()) {
            const otherUser = await this.prisma.user.findUnique({
                where: { id: partnerId },
            });

            if (!otherUser) continue;

            inbox.push({
                user: otherUser,
                latestMessage: msg.content,
                messageId: msg.id,
                createdAt: msg.createdAt,
                isSender: msg.senderId === userId,
            });
        }

        client.emit('chat_inbox', inbox);
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

    @SubscribeMessage('get_live_session_details')
    async handleGetLiveSessionDetails(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { sessionId: string }
    ) {
        try {
            const { sessionId } = data;

            const liveSession = await this.prisma.liveSession.findUnique({
                where: { id: sessionId },
                include: this.fullSessionInclude,
            });

            if (!liveSession) {
                client.emit('error', { message: 'Live session not found' });
                return;
            }

            client.emit('live_session_details', liveSession);
        } catch (error) {
            console.error('Error fetching live session details:', error);
            client.emit('error', { message: 'Could not fetch live session details' });
        }
    }


    @SubscribeMessage('send_comment')
    @UsePipes(new ValidationPipe({ transform: true }))
    async handleSendComment(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: SendCommentDto,
    ) {
        console.log('Received send_comment:', data);

        try {
            const { userId, sessionId, message } = data;

            if (!message.trim()) return;

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
                    liveUser: {
                        include: {
                            user: true, // will be replaced
                        },
                    },
                },
            });

            // ✅ Get correct user info (nullable)
            const actualUser = await this.prisma.user.findUnique({
                where: { id: userId },
            });

            // ✅ Null check
            if (!actualUser) {
                console.warn(`[send_comment] User ${userId} not found`);
                return;
            }

            // ✅ Override with correct user
            if (comment.liveUser) {
                comment.liveUser.user = actualUser;
            }

            this.server.in(sessionId).emit('new_comment', comment);
            console.log(`[EMIT] new_comment to ${sessionId}:`, comment);

        } catch (error) {
            console.error('Error in handleSendComment:', error);
        }
    }


    @SubscribeMessage('participant_left')
    @UsePipes(new ValidationPipe({ transform: true }))
    async handleParticipantLeft(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; sessionId: string },
    ) {
        const { userId, sessionId } = data;

        try {
            const liveUser = await this.findLiveUserInSession(userId, sessionId);

            if (!liveUser || liveUser.role !== 'participant') {
                client.emit('error', {
                    code: 'NOT_PARTICIPANT',
                    message: 'User is not a participant in this session.',
                });
                return;
            }

            // 1. Mark as left in DB and fetch updated liveUser with user relation
            const updatedLiveUser = await this.prisma.liveUser.update({
                where: { id: liveUser.id },
                data: {
                    leftAt: new Date(),
                    participantSessionId: null, // detach participant from session
                },
                include: { user: true },
            });

            // 2. Update activeUsers map
            const userSocketData = this.activeUsers.get(userId);
            if (userSocketData) {
                userSocketData.sessionId = undefined;
                this.activeUsers.set(userId, userSocketData);
            }

            // 3. Leave the socket room
            client.leave(sessionId);



            // 4. Emit `participant_left` with full liveUser info
            this.server.to(sessionId).emit('participant_left', {
                userId,
                liveUser: updatedLiveUser,
                message: 'A participant has left the session.',
            }
            );

            // 5. Emit updated session
            const updatedSession = await this.prisma.liveSession.findUnique({
                where: { id: sessionId },
                include: this.fullSessionInclude,
            });

            this.server.to(sessionId).emit('session_updated', updatedSession);

            console.log(`Participant ${userId} left session ${sessionId}`);
        } catch (error) {
            console.error('Error in handleParticipantLeft:', error);
            client.emit('error', { message: 'Failed to leave as participant.' });
        }
    }





    @SubscribeMessage('participant_go_live')
    async handleParticipantGoLive(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; sessionId: string; rtmpUrl: string }
    ) {
        try {
            const { userId, sessionId } = data;

            const liveSession = await this.prisma.liveSession.findUnique({
                where: { id: sessionId },
            });

            if (!liveSession) {
                client.emit('error', { message: 'Live session not found' });
                return;
            }

            const liveUser = await this.prisma.liveUser.create({
                data: {
                    userId,
                    participantSessionId: sessionId,
                    joinedAt: new Date(),
                    isHost: false,
                    role: 'participant',
                },
                include: {
                    user: true,
                },
            });

            client.join(sessionId);

            const userData = this.activeUsers.get(userId);
            if (userData) {
                userData.sessionId = sessionId;
                this.activeUsers.set(userId, userData);
            }

            this.server.to(sessionId).emit('participant_joined', liveUser);

            const updatedSession = await this.prisma.liveSession.findUnique({
                where: { id: sessionId },
                include: this.fullSessionInclude, // Must include hosts, participants, etc.
            });

            this.server.to(sessionId).emit('session_updated', updatedSession);

        } catch (error) {
            console.error('Error in handleParticipantGoLive:', error);
            client.emit('error', { message: 'Could not join live session as participant' });
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

    @SubscribeMessage('join_request')
    async handleJoinRequest(
        @MessageBody()
        data: {
            userId: string;
            sessionId: string;
            senderId: string;
            receiverId: string;
        },
        @ConnectedSocket() client: Socket,
    ) {
        const { userId, senderId, receiverId } = data;
        try {
            const receiver = this.activeUsers.get(receiverId);
            const actualUser = await this.prisma.user.findUnique({
                where: { id: senderId },
            });

            if (!actualUser) {
                return client.emit('error', { message: 'User not found' });
            }

            receiver?.socket.emit('audience_request_received', actualUser);
        } catch (error) {
            console.error('Error handling join_request:', error);
            client.emit('error', { message: 'Internal server error' });
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

            // ✅ Get correct user info (nullable)
            const actualUser = await this.prisma.user.findUnique({
                where: { id: userId },
            });

            // ✅ Null check
            if (!actualUser) {
                console.warn(`[send_comment] User ${userId} not found`);
                return;
            }


            const liveUser = await this.findLiveUserInSession(userId, sessionId);

            if (!liveUser) {
                console.warn(`[send_comment] No active LiveUser found for ${userId} in session ${sessionId}`);
                return;
            }


            const comment = await this.prisma.liveComment.create({
                data: {
                    liveUserId: liveUser.id,
                    message: `${actualUser.name} has joined the Live.!@`,
                    sessionId,
                },
                include: {
                    liveUser: {
                        include: {
                            user: true, // will be replaced
                        },
                    },
                },
            });


            // ✅ Override with correct user
            if (comment.liveUser) {
                comment.liveUser.user = actualUser;
            }

            this.server.in(sessionId).emit('new_comment', comment);




        } catch (error) {
            console.error('Error in handleJoinAudience:', error);
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
                userSocketData.sessionId = undefined;
                this.activeUsers.set(userId, userSocketData);
            }

            client.leave(sessionId);
        } catch (error) {
            console.error('Error in handleLeaveLive:', error);
        }
    }

}

interface ChatInboxEntry {
    user: any; // Or use a proper UserProfile interface if typed
    latestMessage: string;
    messageId: string;
    createdAt: Date;
    isSender: boolean;
}
