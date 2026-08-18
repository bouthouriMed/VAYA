# VAYA

Production carpooling marketplace for Tunisia. Primary client: Expo/React Native mobile app.

## Stack

pnpm workspaces + Turborepo · Expo + React Native + Expo Router (TS strict) · Fastify + Drizzle ORM + PostgreSQL · Redux Toolkit + RTK Query · OpenAPI → generated client → RTK Query · Zod validation · Vitest (unit) + Playwright (E2E) · Docker Compose (Postgres + Redis)

## Layout

```
apps/{mobile,api,admin}
packages/{design-system,api-client,config,validation,domain,eslint-config}
tests/e2e
docker/            # compose for local Postgres + Redis
```

## Commands

```
pnpm install && docker compose -f docker/docker-compose.yml up -d
pnpm dev:api        # :3000
pnpm dev:mobile      # Expo; add --lan for physical device over LAN
pnpm lint / typecheck / test / format:check
pnpm db:generate / db:migrate / db:studio
pnpm generate:api-client   # requires dev:api running
```

Mobile/API need `.env` (copy from `.env.example`). For Expo Go over LAN, set mobile's `API_BASE_URL` to the host's LAN IP, not `localhost`.

## Rules

- No God components/services, no business logic in UI, no direct HTTP calls from UI (RTK Query only), no direct DB access from controllers
- No circular deps, no premature abstraction/microservices/speculative features, no global mutable state
- No `any` without justification, no silent error swallowing, no secrets in git
- Never hand-edit `packages/api-client/src/generated/` — regenerate instead
- Mobile: feature dirs under `src/features/`; routes compose screens, logic lives in features
- API: Fastify HTTP layer, Zod validation, Drizzle for DB, errors via `AppError` hierarchy
- Reuse `@vaya/design-system` primitives instead of raw RN components
