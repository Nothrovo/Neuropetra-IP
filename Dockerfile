FROM node:22-alpine AS base
RUN npm install -g pnpm@11.28.4
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --ignore-scripts
FROM deps AS builder
# Deliberate allowlist: no runtime secrets, dumps, operator output or repository history.
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY proxy.ts next.config.ts tsconfig.json postcss.config.mjs ./
ENV NODE_ENV=production
RUN pnpm build
FROM deps AS operator
COPY migrations ./migrations
COPY scripts ./scripts
COPY lib ./lib
COPY tsconfig.json ./
USER node
CMD ["node", "scripts/migrate.mjs"]
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
