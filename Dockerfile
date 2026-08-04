# syntax=docker/dockerfile:1.7

# Build stage
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# Ensure a public/ dir exists even if the project doesn't ship one, so the
# runtime COPY below never fails on "not found".
RUN mkdir -p public
RUN npm run build

# Runtime stage
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Railway injects PORT (often 8080). The standalone server reads PORT + HOSTNAME.
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=build --chown=nextjs:nodejs /app/public ./public
# next build (standalone) outputs a self-contained server in .next/standalone
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080

# The standalone server.js honors PORT env. Railway sets PORT=8080.
CMD ["node", "server.js"]
