# Production image for the Fastify API (apps/api). Build from the repo root:
#   docker build -f docker/api.Dockerfile -t vaya-api .
#
# Runs the TypeScript source directly via `tsx` rather than `tsc`-compiled
# output: apps/api's own relative imports omit `.js` extensions (fine for
# `tsx`/the "bundler" moduleResolution used everywhere else in this repo,
# but NOT valid for plain Node ESM `import` resolution), and the workspace
# packages it depends on (@vaya/config, @vaya/domain, @vaya/validation) are
# deliberately consumed as raw TypeScript source (package.json "main":
# "src/index.ts", no build step) rather than compiled — so a `node
# dist/server.js` invocation cannot resolve either and crashes immediately
# on boot (confirmed by actually running it). `tsx` is what apps/api/package.json's
# own `start`/`worker:start` scripts use for exactly this reason; this image
# just runs those same scripts.
#
# Uses `turbo prune` (Turborepo's documented Docker pattern) to build a
# minimal, correctly-pruned copy of the monorepo containing only @vaya/api
# and the workspace packages it actually depends on, so the image doesn't
# need to COPY the entire monorepo (mobile app, admin app, docs, etc).

FROM node:22-alpine AS base
RUN corepack enable

# --- Prune: compute the minimal subset of the monorepo @vaya/api needs ---
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN npx turbo prune @vaya/api --docker

# --- Install: dependency layer, cached separately from source changes ---
FROM base AS installer
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
# HUSKY=0 skips the root `prepare` script's git-hooks install, which expects
# a real .git directory that doesn't exist in this pruned build context.
ENV HUSKY=0
RUN pnpm install --frozen-lockfile --prod

# --- Runner: pruned source on top of the installed dependency layer ---
FROM base AS runner
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=installer /repo .
COPY --from=pruner /repo/out/full/ .
WORKDIR /repo/apps/api

# This image deliberately does NOT run migrations itself (a rolling deploy
# of N replicas must not race N concurrent `drizzle-kit migrate` runs), and
# --prod above strips drizzle-kit along with the rest of devDependencies —
# so migrations are not runnable from inside this image at all. Run
# `pnpm --filter @vaya/api db:migrate` as a separate one-off CI/CD step
# (from a full, non-pruned checkout, pointed at the production DATABASE_URL)
# before rolling out a new revision of this image. See
# PRODUCTION_READINESS.md's pre-launch checklist for the exact sequencing.

EXPOSE 3000
USER node
CMD ["pnpm", "start"]
