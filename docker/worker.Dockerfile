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

# No HTTP server to healthcheck (unlike api.Dockerfile) — worker.ts writes
# /tmp/worker-heartbeat every 15s while genuinely processing; a file older
# than 60s (missed 3+ heartbeats) or altogether missing fails the check,
# catching a wedged-but-still-running process, not just a dead one. Uses
# `node` (always present in this image) rather than a shell/find one-liner —
# alpine's busybox `find` doesn't reliably support `-newermt` across
# versions, and this needs to be exactly right, not "probably works".
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "process.exit(Date.now() - require('fs').statSync('/tmp/worker-heartbeat').mtimeMs > 60000 ? 1 : 0)" || exit 1

CMD ["pnpm", "worker:start"]
