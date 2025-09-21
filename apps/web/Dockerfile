FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/types ./packages/types
COPY apps/web/package.json apps/web/pnpm-lock.yaml ./apps/web/
RUN corepack enable && pnpm install --filter @panelyt/types --filter @panelyt/web...

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable \
  && pnpm --filter @panelyt/types build \
  && pnpm --filter @panelyt/web... build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/.next/BUILD_ID ./.next/BUILD_ID

EXPOSE 3000
CMD ["node", "server.js"]
