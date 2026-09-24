# Multi-stage Docker build for TierMax Gateway
FROM node:22-alpine AS builder

WORKDIR /app

# Build Frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Build Backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install
COPY backend/ ./backend/
RUN cd backend && npm run build

# Production Runtime Stage
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_TYPE=sqlite

# Install production dependencies only
COPY --from=builder /app/backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/frontend/dist ./backend/frontend_dist
COPY --from=builder /app/backend/migrations ./backend/migrations

# Expose HTTP port and local persistent volume
EXPOSE 3000
VOLUME ["/app/backend/data"]

WORKDIR /app/backend
CMD ["node", "dist/index.js"]
