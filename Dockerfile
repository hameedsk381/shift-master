# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npm run build

# Stage 3: Backend build
FROM oven/bun:1 AS backend-builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/package.json backend/bun.lock* ./
RUN bun install --frozen-lockfile

# Copy built frontend assets
COPY --from=frontend-builder /app/dist ./dist

# Stage 4: Production
FROM oven/bun:1 AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy dependencies and code
COPY --from=backend-builder /app/node_modules ./node_modules
COPY backend/ .
COPY --from=frontend-builder /app/dist ./dist

# Use numeric user ID directly (skip user creation for minimal image)
USER 1001

EXPOSE 3000

CMD ["bun", "run", "start"]

