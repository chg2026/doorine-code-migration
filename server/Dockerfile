# Stage 1: Build & Dependency Isolation
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files to leverage npm workspace resolution
COPY package*.json ./

# Copy the server package file explicitly 
COPY server/package*.json ./server/

# Install production dependencies for the server workspace exclusively
RUN npm ci --workspace=@rei-code/server --omit=dev

# Copy the actual server source code
COPY server/ ./server/

# Stage 2: Minimal Runtime Environment
FROM node:20-alpine AS runner
WORKDIR /app

# Copy the isolated workspace and node_modules from builder stage
COPY --from=builder /app /app

# Cloud Run defaults to port 8080
EXPOSE 8080

ENV PORT=8080
ENV NODE_ENV=production

# Execute the start script belonging to the server workspace
CMD ["npm", "run", "start", "--workspace=@rei-code/server"]
