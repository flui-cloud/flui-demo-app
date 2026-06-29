# #flui-managed
# syntax=docker/dockerfile:1.6

# ─── Stage 1: builder ──────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

# ─── Stage 2: runner ───────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=128 --max-semi-space-size=8"

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nest

COPY --from=builder --chown=nest:nodejs /app/dist ./dist
COPY --from=builder --chown=nest:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nest:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nest:nodejs /app/public ./public
COPY --from=builder --chown=nest:nodejs /app/sql ./sql

USER nest

EXPOSE 3000

CMD ["node", "--optimize-for-size", "dist/main.js"]
