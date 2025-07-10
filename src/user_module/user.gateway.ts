import {
    WebSocketGateway,
    OnGatewayConnection,
    OnGatewayDisconnect,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

@WebSocketGateway({
    cors: {
        origin: '*', // update for your production origin
    },
})
export class UserGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private activeUsers: Map<string, Socket> = new Map();

    constructor(private readonly jwtService: JwtService) { }

    async handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth.token;
            if (!token) {
                throw new UnauthorizedException('No token provided');
            }

            const payload = this.jwtService.verify(token, {
                secret: process.env.JWT_SECRET || 'your_jwt_secret',
            });

            if (!payload || !payload.sub) {
                throw new UnauthorizedException('Invalid token payload');
            }

            // Use payload.sub as the userId key
            this.activeUsers.set(payload.sub, client);
            console.log(`User connected: ${payload.sub} (socket id: ${client.id})`);

            // Send welcome message
            client.emit('connected', { message: 'Welcome! Socket connection established.' });
        } catch (err) {
            console.log('Socket connection error:', err.message);
            client.disconnect(true); // forcibly disconnect unauthorized client
        }
    }

    async handleDisconnect(client: Socket) {
        // Remove user from activeUsers map
        for (const [userId, socket] of this.activeUsers.entries()) {
            if (socket.id === client.id) {
                this.activeUsers.delete(userId);
                console.log(`User disconnected: ${userId} (socket id: ${client.id})`);
                break;
            }
        }
    }

    // Send a message to a specific user by userId
    sendMessageToUser(userId: string, event: string, message: any) {
        const clientSocket = this.activeUsers.get(userId);
        if (clientSocket) {
            clientSocket.emit(event, message);
        }
    }
}
