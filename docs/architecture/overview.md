# Architecture Overview

## System Architecture

VAYA follows a client-server architecture with a clear separation between the mobile client and the backend API.

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Mobile App     │────▶│   REST API       │────▶│  PostgreSQL  │
│  (Expo + RN)     │     │  (Fastify + TS)  │     │              │
└──────────────────┘     └──────────────────┘     └──────────────┘
        │                       │                        │
        │                       │                  ┌─────┴─────┐
        │                       │                  │   Redis   │
        │                       │                  │ (optional)│
        │                       │                  └───────────┘
        ▼                       ▼
   Redux Toolkit          Drizzle ORM
   + RTK Query            + Migrations
        │                       │
        ▼                       ▼
  Generated Client        OpenAPI Contract
  (from OpenAPI)
```

## Key Principles

1. **Separation of Concerns**: Each layer has a single responsibility
2. **Contract-First**: API contract (OpenAPI) drives client generation
3. **Feature Orientation**: Code organized by business domain
4. **Infrastructure Boundaries**: Framework code at edges, domain logic in center

## Package Responsibilities

| Package               | Purpose                               |
| --------------------- | ------------------------------------- |
| `@vaya/mobile`        | Expo React Native application         |
| `@vaya/api`           | Node.js REST API server               |
| `@vaya/api-client`    | Generated TypeScript API client       |
| `@vaya/design-system` | React Native UI components and tokens |
| `@vaya/config`        | Shared application constants          |
| `@vaya/validation`    | Shared Zod validation schemas         |
| `@vaya/domain`        | Core domain types                     |
| `@vaya/eslint-config` | Shared ESLint rules                   |
