# ClaudeOps Production Dockerfile
# Multi-stage build for optimized production deployment

# Stage 1: Dependencies and build
FROM node:22-alpine AS base

# Install system dependencies for better-sqlite3 and other native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    sqlite-dev \
    libc6-compat

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Stage 2: Build stage
FROM base AS build

# Install all dependencies including dev dependencies
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build the application
RUN npm run build && \
    npm run db:generate

# Stage 3: Production runtime
FROM node:22-alpine AS runtime

# Install runtime dependencies
RUN apk add --no-cache \
    sqlite \
    curl \
    tini \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001

# Set working directory
WORKDIR /app

# Copy built application from build stage
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# Copy database migrations and schema
COPY --from=build --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=build --chown=nextjs:nodejs /app/drizzle.config.ts ./

# Copy server configuration
COPY --from=build --chown=nextjs:nodejs /app/server.js ./
COPY --from=build --chown=nextjs:nodejs /app/package.json ./

# Create necessary directories
RUN mkdir -p /app/data /app/logs /app/temp/agents /app/backups && \
    chown -R nextjs:nodejs /app/data /app/logs /app/temp /app/backups

# Create startup script
RUN cat > /app/start.sh << 'EOF'
#!/bin/sh
set -e

echo "Starting ClaudeOps..."

# Ensure directories exist
mkdir -p /app/data /app/logs /app/temp/agents /app/backups

# Run database migrations if needed
if [ ! -f /app/data/production.db ]; then
    echo "Initializing database..."
    npm run db:migrate
fi

# Start the application
echo "Starting server..."
exec node server.js
EOF

RUN chmod +x /app/start.sh && chown nextjs:nodejs /app/start.sh

# Set environment variables
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/system/health || exit 1

# Switch to non-root user
USER nextjs

# Expose ports
EXPOSE 3000 3001

# Use tini as PID 1
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["/app/start.sh"]

# Labels for metadata
LABEL maintainer="ClaudeOps Team"
LABEL version="1.0.0"
LABEL description="AI-powered homelab automation with Claude agent execution monitoring"
LABEL org.opencontainers.image.source="https://github.com/yourusername/claudeops"