import { AuthGuard } from "@nestjs/passport";

export class JwtAdminGuard extends AuthGuard('jwtA') {
    constructor() {
        super();
    }
}