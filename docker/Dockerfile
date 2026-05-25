# syntax=docker/dockerfile:1
# ─── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:22-alpine AS deps

ARG PNPM_VERSION=10.33.2

RUN apk add --no-cache libc6-compat && \
    npm install -g pnpm@${PNPM_VERSION}

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# ─── Stage 2: Builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

ARG PNPM_VERSION=10.33.2

RUN apk add --no-cache libc6-compat && \
    npm install -g pnpm@${PNPM_VERSION}

WORKDIR /app

# Config files for next build
COPY next.config.ts tsconfig.json postcss.config.mjs ./
COPY messages ./messages
COPY public ./public
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules

# Source code
COPY src ./src
COPY scripts ./scripts
COPY eslint.config.mjs ./

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm build

# ─── Stage 3: Runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache tini wget

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Static assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/messages ./messages

# Standalone output — Next.js recommended for Docker
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

ENTRYPOINT ["tini", "--"]

CMD ["node", "server.js"]

# ─── Stage 4: Seeder ───────────────────────────────────────────────────────────
FROM node:22-alpine AS seeder

ARG PNPM_VERSION=10.33.2

RUN apk add --no-cache libc6-compat curl python3 && \
    npm install -g pnpm@${PNPM_VERSION}

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY --from=deps /app/node_modules ./node_modules
COPY scripts ./scripts
COPY .env.local* ./

ENTRYPOINT ["tini", "--"]
CMD ["sh", "-c", "node scripts/seed-stations.mjs && node scripts/seed-horarios.mjs"]
