## Quick orientation

This is a NestJS backend (TypeScript) using Prisma as the ORM and Socket.IO for realtime. Aim to make minimal, well-scoped changes, follow existing module boundaries, and prefer editing or adding files inside `src/`.

Key places to look:
- `src/` — feature modules follow Nest conventions (e.g. `src/auth`, `src/user_module`, `src/prisma`, `src/message`, `src/gifts`).
- `src/user_module/user.gateway.ts` — canonical example of Socket.IO usage, JWT handshake, room management and Prisma transactions.
- `src/prisma/prisma.service.ts` — Prisma client is configured and exported from `generated/prisma` (client is pre-generated in `generated/prisma`).
- `prisma/schema.prisma` — DB schema; migrations and client generation may be required when changing models.

## How to run & developer workflows
- Install: `yarn install` (project uses yarn)
- Dev server: `yarn start:dev` (Nest watch mode)
- Build: `yarn build` → `yarn start:prod` to run `dist` output
- Tests: `yarn test` (unit), `yarn test:e2e` (e2e via Jest)
- Lint & format: `yarn lint`, `yarn format`

If you need to regenerate Prisma client: `npx prisma generate --schema=prisma/schema.prisma` (the project imports the client from `generated/prisma`).

Environment variables (used in code):
- `DATABASE_URL` — used by `PrismaService`.
- `JWT_SECRET`, `ADMIN_SECRET` — used by auth and WebSocket JWT verification. Some socket code falls back to a placeholder secret; prefer env secrets.

## Project-specific patterns & conventions
- Feature-per-module: each folder in `src/` is a Nest module exposing a controller/service; prefer adding code to the corresponding module.
- Prisma usage: services and gateways call `this.prisma.*`. Transactions often use `this.prisma.$transaction`. When altering DB models, update `prisma/schema.prisma` and run `prisma generate`.
- Websocket conventions (see `user.gateway.ts`):
  - JWT is read from `client.handshake.auth.token` for socket connections.
  - The gateway keeps an in-memory `activeUsers: Map<string, { socket, sessionId? }>` to map userId → socket and session state; updates to this map must stay consistent with DB `liveUser` rows.
  - Room emissions use `this.server.to(sessionId)` or `this.server.in(sessionId)` and follow event names like `session_updated`, `live_ended`, `gift_received`, `new_comment` — reuse these event names for compatibility.
  - Example DTOs and ValidationPipe usage live inside gateway files (method decorators like `@UsePipes(new ValidationPipe({ transform: true }))`).

## Integration points & external deps
- Prisma client: `generated/prisma` (non-standard path). Do not change the import path unless you update generation settings.
- Auth: `@nestjs/jwt` + `passport-jwt` with `JwtStrategy` (see `src/strategy/jwt.strategy.ts`) — HTTP endpoints use Bearer tokens; sockets use handshake auth token.
- Realtime: Socket.IO via `@nestjs/platform-socket.io` and `@nestjs/websockets`.

## Helpful examples to reference when coding
- Creating/using Prisma transactions: see `handleSendGift` in `src/user_module/user.gateway.ts`.
- Socket auth and lifecycle: `handleConnection`, `handleDisconnect`, and `activeUsers` usage in `src/user_module/user.gateway.ts`.
- Auth flows: social login and JWT generation in `src/auth/auth.service.ts`.

## Safety notes for agents
- Preserve existing event names and Prisma relations when changing realtime messages — clients depend on those strings.
- Avoid removing or renaming `generated/prisma` without running a full regen and updating imports project-wide.
- Changes to `activeUsers` behavior must account for disconnect cleanup (DB `leftAt` updates) to avoid orphaned sessions.

If anything in this file is unclear or you want me to expand examples (e.g., common socket event shapes, Prisma model excerpts, or a checklist for running migrations), tell me which section to expand.
