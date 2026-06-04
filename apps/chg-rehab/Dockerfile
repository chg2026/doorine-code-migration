# Stage 1: Dependencies install
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy the package files specific to this app
COPY package*.json ./
RUN npm install

# Stage 2: Build the Next.js application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Copy the environment file from current context to the builder's root.
# The '|| true' ensures the build succeeds even if Next.js handles it automatically.
RUN cp .env.production ./.env.production || true

RUN npm run build

# Stage 3: Runner container environment
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Correctly copy over monorepo assets into their proper workspace trees
COPY --from=builder /app/apps/chg-rehab/public ./apps/chg-rehab/public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./apps/chg-rehab/.next/static

USER nextjs

EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Target the standalone server entry point for the specific app folder
CMD ["node", "apps/chg-rehab/server.js"]
