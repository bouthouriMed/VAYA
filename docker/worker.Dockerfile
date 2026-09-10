# Production image for the BullMQ background worker (apps/api/src/worker.ts
# — notification dispatch + recurring-pattern scan + trip-staleness sweep +
# booking-expiry sweep, per CLAUDE.md's "one minimal queue" design). Build
# from the repo root:
#   docker build -f docker/worker.Dockerfile -t vaya-worker .
#
# Same image shape as api.Dockerfile (see that file's comments for why this
# runs via `tsx` rather than `tsc`-compiled output, and why `turbo prune` is
# used) — this process is a separate deploy unit from the API server, not a
# thread inside it, so it gets its own image rather than reusing the API
# image with a different CMD override (keeps each image's deploy/restart/
# scaling policy independent, and keeps this Dockerfile's own diff minimal
# if the two ever need different dependencies).

FROM node:22-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN npx turbo prune @vaya/api --docker

FROM base AS installer
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
ENV HUSKY=0
RUN pnpm install --frozen-lockfile --prod

FROM base AS runner
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=installer /repo .
COPY --from=pruner /repo/out/full/ .
WORKDIR /repo/apps/api

USER node
CMD ["pnpm", "worker:start"]
