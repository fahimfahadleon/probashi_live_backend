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
import { ActiveUserService } from './active-user.service';
import { AccessToken } from 'livekit-server-sdk';

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
    constructor(private readonly jwtService: JwtService, private prisma: PrismaService, private activeUserService: ActiveUserService) { }

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

    private async generateLiveKitToken(
    userId: string,
    sessionId: string,
    role: 'host' | 'participant' | 'audience',
) {
    const token = new AccessToken(
        process.env.LIVEKIT_API_KEY!,
        process.env.LIVEKIT_API_SECRET!,
        {
            identity: userId,
            name: userId,
        }
    );

    token.addGrant({
        room: sessionId,
        roomJoin: true,
        canPublish: role !== 'audience',
        canSubscribe: true,
    });

    return {
        token: await token.toJwt(),
        url: process.env.LIVEKIT_URL,
    };
}


//     async handleConnection(client: Socket) {
//         try {
//             const token = client.handshake.auth.token;
//             if (!token) throw new UnauthorizedException('No token provided');

//             const payload = this.jwtService.verify(token, {
//                 secret: process.env.JWT_SECRET || 'your_jwt_secret',
//             });

//             if (!payload?.sub) throw new UnauthorizedException('Invalid token payload');

//             this.activeUsers.set(payload.sub, { socket: client });
//             console.log(`User connected: ${payload.sub} (socket id: ${client.id})`);

//             client.emit('connected', {
//                 message: 'Welcome! Socket connection established.',
//                 userId: payload.sub,
//             });

//        const socketId = client.id;
// const userId = payload.sub;

// // Store both temporarily
// this.activeUsers.set(userId, { socket: client, socketId });
// this.socketToUser.set(socketId, userId);

//         } catch (err) {
//             console.log('Socket connection error:', err.message);
//             client.disconnect(true);
//         }
//     }






    private activeUsers: Map<string, { socket: Socket; sessionId?: string }> = new Map();

// Add a reverse lookup map (more efficient)
private socketToUser: Map<string, string> = new Map();  // socket.id -> userId

async handleConnection(client: Socket) {
    try {
        const token = client.handshake.auth.token;
        if (!token) throw new UnauthorizedException('No token provided');

        const payload = this.jwtService.verify(token, {
            secret: process.env.JWT_SECRET || 'your_jwt_secret',
        });

        if (!payload?.sub) throw new UnauthorizedException('Invalid token payload');

        // Store the main mapping
        this.activeUsers.set(payload.sub, { socket: client });
        
        // Store reverse mapping for O(1) lookups
        this.socketToUser.set(client.id, payload.sub);
        
        console.log(`User connected: ${payload.sub} (socket id: ${client.id})`);

        client.emit('connected', {
            message: 'Welcome! Socket connection established.',
            userId: payload.sub,
        });

        // Fix this: Use actual userId, not socket.id
        const userId = payload.sub;  // <-- THIS IS THE CRITICAL FIX
        this.activeUserService.addUser(userId);  // Now tracking actual users

    } catch (err) {
        console.log('Socket connection error:', err.message);
        client.disconnect(true);
    }
}





    // async handleDisconnect(client: Socket) {
    //     for (const [userId, { socket, sessionId }] of this.activeUsers.entries()) {
    //         if (socket.id === client.id) {
    //             this.activeUsers.delete(userId);
    //             console.log(`User disconnected: ${userId} (socket id: ${client.id})`);

    //             if (sessionId) {
    //                 try {
    //                     const liveUser = await this.prisma.liveUser.findFirst({
    //                         where: {
    //                             userId,
    //                             leftAt: null,
    //                             OR: [
    //                                 { hostSessionId: sessionId },
    //                                 { participantSessionId: sessionId },
    //                                 { audienceSessionId: sessionId },
    //                             ],
    //                         },
    //                     });


    //                     if (liveUser) {
    //                         const isHost = liveUser.isHost;

    //                         if (isHost) {
    //                             // Emit live_ended BEFORE updating leftAt and endedAt
    //                             const updatedSession = await this.prisma.liveSession.findUnique({
    //                                 where: { id: sessionId },
    //                                 include: this.fullSessionInclude,
    //                             });

    //                             this.server.to(sessionId).emit('live_ended', updatedSession);

    //                             await this.prisma.liveSession.update({
    //                                 where: { id: sessionId },
    //                                 data: { endedAt: new Date() },
    //                             });
    //                         }

    //                         await this.prisma.liveUser.update({
    //                             where: { id: liveUser.id },
    //                             data: { leftAt: new Date() },
    //                         });

    //                         if (!isHost) {
    //                             const roleLeft =
    //                                 liveUser.role === 'participant'
    //                                     ? 'participant_left'
    //                                     : liveUser.role === 'audience'
    //                                         ? 'audience_left'
    //                                         : 'unknown_role_left';

    //                             //todo ekhane somossa ase. null pay ekta value

    //                             this.server.to(sessionId).emit(roleLeft, { userId });
    //                         }

    //                         const updatedSession = await this.prisma.liveSession.findUnique({
    //                             where: { id: sessionId },
    //                             include: this.fullSessionInclude,
    //                         });

    //                         this.server.to(sessionId).emit('session_updated', updatedSession);
    //                     }
    //                 } catch (error) {
    //                     console.error('Error handling disconnect cleanup:', error);
    //                 }
    //             }
    //             break;
    //         }
    //     }

    //     const userId = client.id;
    //     this.activeUserService.removeUser(userId);
    // }

    async handleDisconnect(client: Socket) {
    // O(1) lookup instead of O(n)
    const userId = this.socketToUser.get(client.id);
    
    if (!userId) {
        console.log(`Socket ${client.id} disconnected with no associated user`);
        this.activeUserService.removeUser(client.id);
        return;
    }

    const userData = this.activeUsers.get(userId);
    
    // Clean up both maps
    this.activeUsers.delete(userId);
    this.socketToUser.delete(client.id);
    
    console.log(`User disconnected: ${userId} (socket id: ${client.id})`);

    // Remove from activeUserService using actual userId
    this.activeUserService.removeUser(userId);

    // Rest of your disconnect logic...
    if (userData?.sessionId) {
        try {
            const liveUser = await this.prisma.liveUser.findFirst({
                where: {
                    userId,
                    leftAt: null,
                    OR: [
                        { hostSessionId: userData.sessionId },
                        { participantSessionId: userData.sessionId },
                        { audienceSessionId: userData.sessionId },
                    ],
                },
            });
            
            // ... rest of your existing disconnect code
        } catch (error) {
            console.error('Error handling disconnect cleanup:', error);
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



@SubscribeMessage('leave_audience')
@UsePipes(new ValidationPipe({ transform: true }))
async handleLeaveAudience(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; sessionId: string },
) {
    try {
        const { userId, sessionId } = data;

        // 1. Find active audience LiveUser
        const liveUser = await this.prisma.liveUser.findFirst({
            where: {
                userId,
                audienceSessionId: sessionId,
                role: 'audience',
                leftAt: null,
            },
            include: { user: true },
        });

        if (!liveUser) {
            console.warn(`[leave_audience] No active audience found for ${userId}`);
            client.leave(sessionId);
            return;
        }

        // 2. Mark audience as left
        await this.prisma.liveUser.update({
            where: { id: liveUser.id },
            data: {
                leftAt: new Date(),
                audienceSessionId: null,
            },
        });

        // 3. Leave socket room
        client.leave(sessionId);

        // 4. Update activeUsers map
        const userSocketData = this.activeUsers.get(userId);
        if (userSocketData) {
            userSocketData.sessionId = undefined;
            this.activeUsers.set(userId, userSocketData);
        }

        // 5. Emit audience_left
        this.server.to(sessionId).emit('audience_left', {
            userId,
            liveUser,
            message: 'Audience left the session',
        });

        // 6. Emit updated session
        const updatedSession = await this.prisma.liveSession.findUnique({
            where: { id: sessionId },
            include: this.fullSessionInclude,
        });

        this.server.to(sessionId).emit('session_updated', updatedSession);

        // 7. Optional system comment
        await this.prisma.liveComment.create({
            data: {
                liveUserId: liveUser.id,
                sessionId,
                message: `${liveUser.user.name} left the live.`,
            },
        });

    } catch (error) {
        console.error('Error in handleLeaveAudience:', error);
        client.emit('error', {
            code: 'LEAVE_AUDIENCE_FAILED',
            message: 'Failed to leave audience',
        });
    }
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

    // @SubscribeMessage('invite_accepted')
    // async handleInviteAccepted(
    //     @ConnectedSocket() client: Socket,
    //     @MessageBody() data: { fromUserId: string, userId: string; sessionId: string },
    // ) {
    //     const { fromUserId, userId, sessionId } = data;
    //     const fromUser = this.activeUsers.get(fromUserId);
    //     if (!fromUser) {
    //         client.emit('error', { code: 'USER_NOT_CONNECTED', message: 'One of the users is not connected' });
    //         return;
    //     }
    //     // You can add validation or DB logic here if needed

    //     // Notify the inviter or the session that invite was accepted
    //     fromUser?.socket.emit('invite_accepted', {
    //         userId,
    //         sessionId,
    //         message: `${userId} accepted the invite`,
    //     });

    //     console.log(`Invite accepted by ${userId} for session ${sessionId}`);
    // }

//     @SubscribeMessage('invite_accepted')
// async handleInviteAccepted(
//     @ConnectedSocket() client: Socket,
//     @MessageBody() data: { fromUserId: string; userId: string; sessionId: string },
// ) {
//     try {
//         const { fromUserId, userId, sessionId } = data;

//         // 1. Create participant LiveUser
//         const liveUser = await this.prisma.liveUser.create({
//             data: {
//                 userId,
//                 participantSessionId: sessionId,
//                 joinedAt: new Date(),
//                 isHost: false,
//                 role: 'participant',
//             },
//             include: { user: true },
//         });

//         // 2. Update socket state
//         const userSocketData = this.activeUsers.get(userId);
//         if (userSocketData) {
//             userSocketData.sessionId = sessionId;
//             this.activeUsers.set(userId, userSocketData);
//         }

//         client.join(sessionId);

//         // 3. Emit participant joined
//         this.server.to(sessionId).emit('participant_joined', liveUser);

//         // 4. Generate WebRTC token (PARTICIPANT CAN PUBLISH)
//         const webrtc = await this.generateLiveKitToken(
//             userId,
//             sessionId,
//             'participant',
//         );

//         // 5. Send token to participant ONLY
//         client.emit('webrtc_token', webrtc);

//         // 6. Notify host
//         const host = this.activeUsers.get(fromUserId);
//         host?.socket.emit('invite_accepted', {
//             userId,
//             sessionId,
//         });

//         console.log(`User ${userId} became participant in ${sessionId}`);
//     } catch (error) {
//         console.error('Error in handleInviteAccepted:', error);
//         client.emit('error', { message: 'Failed to join as participant' });
//     }
// }

@SubscribeMessage('invite_accepted')
async handleInviteAccepted(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { fromUserId: string; userId: string; sessionId: string },
) {
    try {
        const { fromUserId, userId, sessionId } = data;

        // 1. Create participant LiveUser
        const liveUser = await this.prisma.liveUser.create({
            data: {
                userId,
                participantSessionId: sessionId,
                joinedAt: new Date(),
                isHost: false,
                role: 'participant',
            },
            include: { user: true },
        });

        // 2. Update socket state
        const userSocketData = this.activeUsers.get(userId);
        if (userSocketData) {
            userSocketData.sessionId = sessionId;
            this.activeUsers.set(userId, userSocketData);
        }

        client.join(sessionId);

        // 3. Emit participant joined
        this.server.to(sessionId).emit('participant_joined', liveUser);

        // 4. Generate WebRTC token (PARTICIPANT CAN PUBLISH)
        const webrtc = await this.generateLiveKitToken(
            userId,
            sessionId,
            'participant',
        );

        // 5. Send token to participant ONLY
        client.emit('webrtc_token', webrtc);

        // 6. Fetch updated session WITH all participants
        const updatedSession = await this.prisma.liveSession.findUnique({
            where: { id: sessionId },
            include: this.fullSessionInclude, // Make sure this includes hosts, participants, audience
        });

        if (!updatedSession) {
            throw new Error(`Session ${sessionId} not found after participant joined`);
        }

        // 7. Emit updated session to everyone in the room (including host)
        this.server.to(sessionId).emit('session_updated', updatedSession);

      

    } catch (error) {
        console.error('Error in handleInviteAccepted:', error);
        client.emit('error', { message: 'Failed to join as participant' });
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



    @SubscribeMessage('kick_audience')
    @UsePipes(new ValidationPipe({ transform: true }))
    async handleKickParticipant(@ConnectedSocket() client: Socket, @MessageBody() data: { userId: string; sessionId: string }) {
        const { userId, sessionId } = data;
        const toUser = this.activeUsers.get(userId);
        if (!toUser) {
            client.emit('error', { code: 'USER_NOT_CONNECTED', message: 'User is not connected' });
            return;
        }
        try {
            toUser.socket.emit('kicked_from_session', { 'sessionId': sessionId, message: 'You have been kicked from the session.' });
        } catch (error) {
            console.error('Error in handleKickParticipant:', error);
            client.emit('error', { code: 'KICK_FAILED', message: 'Failed to kick participant' });
        }

    }



    @SubscribeMessage('mute_audience')
    @UsePipes(new ValidationPipe({ transform: true }))
    async handleMuteParticipant(@ConnectedSocket() client: Socket, @MessageBody() data: { userId: string; sessionId: string }) {
        const { userId, sessionId } = data;
        const toUser = this.activeUsers.get(userId);
        if (!toUser) {
            client.emit('error', { code: 'USER_NOT_CONNECTED', message: 'User is not connected' });
            return;
        }
        try {
            toUser.socket.emit('muted_from_session', { 'sessionId': sessionId, message: 'You have been muted from the session.' });
        } catch (error) {
            console.error('Error in handleMUteParticipant:', error);
            client.emit('error', { code: 'MUTE_FAILED', message: 'Failed to Mute participant' });
        }

    }

    @SubscribeMessage('unmute_audience')
    @UsePipes(new ValidationPipe({ transform: true }))
    async handleUnMuteParticipant(@ConnectedSocket() client: Socket, @MessageBody() data: { userId: string; sessionId: string }) {
        const { userId, sessionId } = data;
        const toUser = this.activeUsers.get(userId);
        if (!toUser) {
            client.emit('error', { code: 'USER_NOT_CONNECTED', message: 'User is not connected' });
            return;
        }
        try {
            toUser.socket.emit('unmuted_audience', { 'sessionId': sessionId, message: 'You have been Unmuted by host.' });
        } catch (error) {
            console.error('Error in handleUnMUteParticipant:', error);
            client.emit('error', { code: 'UNMUTE_FAILED', message: 'Failed to UnMute Audience' });
        }

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
                const fromUser = await prisma.user.findUnique({ where: { id: fromLiveUser.user.id } });
                const toUser = await prisma.user.findUnique({ where: { id: toLiveUser.user.id } });

                if (!fromUser || !toUser) {
                    throw new Error('Users not found');
                }

                const settings = await prisma.settings.findUnique({ where: { id: 1 } });
                const profitMargin = settings?.profitMargin ?? 0;

                const price = gift.price;
                const platformCut = Math.floor((price * profitMargin) / 100);
                const receiverAmount = price - platformCut;

                if (fromUser.diamond < price) {
                    throw new Error('Insufficient diamonds');
                }

                // Deduct full from sender
                await prisma.user.update({
                    where: { id: fromUser.id },
                    data: { diamond: { decrement: price } },
                });

                // Credit only the % amount to the receiver
                await prisma.user.update({
                    where: { id: toUser.id },
                    data: { diamond: { increment: receiverAmount } },
                });

                // Save platform earnings for transparency


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



    // @SubscribeMessage('go_live')
    // async handleGoLive(
    //     @ConnectedSocket() client: Socket,
    //     @MessageBody() data: { userId: string; rtmpUrl: string },
    // ) {
    //     try {
    //         const liveSession = await this.prisma.liveSession.create({
    //             data: {},
    //         });

    //         await this.prisma.liveUser.create({
    //             data: {
    //                 userId: data.userId,
    //                 hostSessionId: liveSession.id,
    //                 joinedAt: new Date(),
    //                 isHost: true,
    //                 role: 'host',
    //             },
    //         });

    //         const fullSession = await this.prisma.liveSession.findUnique({
    //             where: { id: liveSession.id },
    //             include: this.fullSessionInclude,
    //         });

    //         const userData = this.activeUsers.get(data.userId);
    //         if (userData) {
    //             userData.sessionId = liveSession.id;
    //             this.activeUsers.set(data.userId, userData);

    //             client.join(liveSession.id);

    //             console.log(`Socket ${client.id} joined room ${liveSession.id}`);
    //         }

    //         client.emit('live_started', fullSession);
    //     } catch (error) {
    //         console.error('Error in handleGoLive:', error);
    //     }
    // }


    @SubscribeMessage('go_live')
async handleGoLive(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; rtmpUrl?: string },
) {
    try {
        // 1. Create live session
        const liveSession = await this.prisma.liveSession.create({
            data: {},
        });

        // 2. Create host LiveUser
        await this.prisma.liveUser.create({
            data: {
                userId: data.userId,
                hostSessionId: liveSession.id,
                joinedAt: new Date(),
                isHost: true,
                role: 'host',
            },
        });

        // 3. Update socket state
        const userData = this.activeUsers.get(data.userId);
        if (userData) {
            userData.sessionId = liveSession.id;
            this.activeUsers.set(data.userId, userData);
        }

        client.join(liveSession.id);

        // 4. Generate WebRTC token (HOST CAN PUBLISH)
        const webrtc = await this.generateLiveKitToken(
            data.userId,
            liveSession.id,
            'host',
        );

        const fullSession = await this.prisma.liveSession.findUnique({
            where: { id: liveSession.id },
            include: this.fullSessionInclude,
        });


        console.log('Generated LiveKit token:', webrtc);

        // 5. Emit to host
        client.emit('live_started', {
            fullSession,
            webrtc,
        });

        console.log(`Host ${data.userId} started live ${liveSession.id}`);
    } catch (error) {
        console.error('Error in handleGoLive:', error);
        client.emit('error', { message: 'Failed to start live session' });
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


    // @SubscribeMessage('join_audience')
    // async handleJoinAudience(
    //     @ConnectedSocket() client: Socket,
    //     @MessageBody() data: { userId: string; sessionId: string },
    // ) {
    //     try {
    //         const { userId, sessionId } = data;

    //         client.join(sessionId);
    //         console.log(`Socket ${client.id} joined room ${sessionId}`);

    //         const existingAudience = await this.prisma.liveUser.findFirst({
    //             where: {
    //                 userId,
    //                 audienceSessionId: sessionId,
    //                 leftAt: null,
    //             },
    //         });

    //         if (existingAudience) {
    //             await this.prisma.liveUser.update({
    //                 where: { id: existingAudience.id },
    //                 data: {
    //                     leftAt: null,
    //                     joinedAt: new Date(),
    //                     role: 'audience',
    //                 },
    //             });
    //         } else {
    //             await this.prisma.liveUser.create({
    //                 data: {
    //                     userId,
    //                     audienceSessionId: sessionId,
    //                     joinedAt: new Date(),
    //                     isHost: false,
    //                     role: 'audience',
    //                 },
    //             });
    //         }

    //         const userSocketData = this.activeUsers.get(userId);
    //         if (userSocketData) {
    //             userSocketData.sessionId = sessionId;
    //             this.activeUsers.set(userId, userSocketData);
    //         }

    //         this.server.in(sessionId).emit('audience_joined', { userId, role: 'audience' });

    //         const updatedSession = await this.prisma.liveSession.findUnique({
    //             where: { id: sessionId },
    //             include: this.fullSessionInclude,
    //         });
    //         this.server.in(sessionId).emit('session_updated', updatedSession);

    //         // ✅ Get correct user info (nullable)
    //         const actualUser = await this.prisma.user.findUnique({
    //             where: { id: userId },
    //         });

    //         // ✅ Null check
    //         if (!actualUser) {
    //             console.warn(`[send_comment] User ${userId} not found`);
    //             return;
    //         }


    //         const liveUser = await this.findLiveUserInSession(userId, sessionId);

    //         if (!liveUser) {
    //             console.warn(`[send_comment] No active LiveUser found for ${userId} in session ${sessionId}`);
    //             return;
    //         }


    //         const comment = await this.prisma.liveComment.create({
    //             data: {
    //                 liveUserId: liveUser.id,
    //                 message: `${actualUser.name} has joined the Live.!@`,
    //                 sessionId,
    //             },
    //             include: {
    //                 liveUser: {
    //                     include: {
    //                         user: true, // will be replaced
    //                     },
    //                 },
    //             },
    //         });


    //         // ✅ Override with correct user
    //         if (comment.liveUser) {
    //             comment.liveUser.user = actualUser;
    //         }

    //         this.server.in(sessionId).emit('new_comment', comment);




    //     } catch (error) {
    //         console.error('Error in handleJoinAudience:', error);
    //     }
    // }

    @SubscribeMessage('join_audience')
async handleJoinAudience(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; sessionId: string },
) {
    try {
        const { userId, sessionId } = data;

        client.join(sessionId);

        // 1. Create or reuse LiveUser (audience)
        const existingAudience = await this.prisma.liveUser.findFirst({
            where: {
                userId,
                audienceSessionId: sessionId,
                leftAt: null,
            },
        });

        if (!existingAudience) {
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

        // 2. Update socket state
        const userSocketData = this.activeUsers.get(userId);
        if (userSocketData) {
            userSocketData.sessionId = sessionId;
            this.activeUsers.set(userId, userSocketData);
        }

        // 3. Emit audience joined
        this.server.to(sessionId).emit('audience_joined', {
            userId,
            role: 'audience',
        });

        // 4. Emit updated session
        const updatedSession = await this.prisma.liveSession.findUnique({
            where: { id: sessionId },
            include: this.fullSessionInclude,
        });

        this.server.to(sessionId).emit('session_updated', updatedSession);

        // 5. Generate WebRTC token (AUDIENCE CAN NOT PUBLISH)
        const webrtc = await this.generateLiveKitToken(
            userId,
            sessionId,
            'audience',
        );

           console.log('Generated LiveKit token:', webrtc);

        // 6. Send token ONLY to this client
        client.emit('webrtc_token', webrtc);

        console.log(`Audience ${userId} joined live ${sessionId}`);
    } catch (error) {
        console.error('Error in handleJoinAudience:', error);
        client.emit('error', { message: 'Failed to join as audience' });
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
    getOnlineUserCount() {
        return this.activeUsers.size;
    }
}

interface ChatInboxEntry {
    user: any; // Or use a proper UserProfile interface if typed
    latestMessage: string;
    messageId: string;
    createdAt: Date;
    isSender: boolean;
}
