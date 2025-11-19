import { Injectable } from "@nestjs/common";

// active-user.service.ts
@Injectable()
export class ActiveUserService {
    private onlineUsers = new Set<string>();

    addUser(userId: string) { this.onlineUsers.add(userId); }
    removeUser(userId: string) { this.onlineUsers.delete(userId); }
    getOnlineUserCount() { return this.onlineUsers.size; }
}
