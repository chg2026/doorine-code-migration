# Stage 1: Build & Dependency Isolation
FROM node:20-alpine AS builder

WORKDIR /app

# Since we are already inside the server directory context, 
# copy its package.json right to the work directory
COPY package*.json ./

# Install production dependencies for this isolated app
RUN npm ci --omit=dev

# Copy the rest of the server source code files
COPY . .

# Stage 2: Minimal Runtime Environment
FROM node:20-alpine AS runner
WORKDIR /app

# Copy everything we just built from the builder stage
COPY --from=builder /app /app

# Cloud Run defaults to port 8080
EXPOSE 8080

ENV PORT=8080
ENV NODE_ENV=production

# Run the standard start script directly
CMD ["npm", "run", "start"]
