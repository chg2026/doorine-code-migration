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

# Next.js collects completely anonymous telemetry data about general usage.
# Un-comment the following line to disable telemetry during the build:
ENV NEXT_TELEMETRY_DISABLED=1

# Tell Next.js we are building for production
ENV NODE_ENV=production

RUN npm run build

# Stage 3: Runner container environment
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a system user to run the app securely without root permissions
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the built assets and standalone configurations from the builder stage
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# Cloud Run defaults to port 8080, instruct Next.js to listen there
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Start the Next.js production server
CMD ["node", "server.js"]
