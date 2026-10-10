FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY prisma.config.ts ./prisma.config.ts
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
# Shown at the bottom of the sidebar (see src/lib/app-version.ts); set by
# the image workflow.
ARG APP_VERSION=dev
ARG APP_BUILD=
ARG APP_REVISION=
ENV NEXT_PUBLIC_APP_VERSION=$APP_VERSION NEXT_PUBLIC_APP_BUILD=$APP_BUILD NEXT_PUBLIC_APP_REVISION=$APP_REVISION
# Forks that host their own docs: where "Full guide" links point.
ARG DOCS_URL=
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
# One-off maintenance (moving uploads into S3-compatible storage).
COPY --from=builder /app/scripts/move-files-to-object-storage.mts ./scripts/move-files-to-object-storage.mts
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=builder --chown=nextjs:nodejs /app/certs ./certs

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["sh", "docker-entrypoint.sh"]
