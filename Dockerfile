# Production-grade container for DealPad (Node + Vite SPA served by
# the Express backend). Used by Render (when env: docker) and any
# other container host (Fly.io, ECS, k8s).
#
# Stage 1: build the SPA + ts type-check
# Stage 2: runtime image with only what's needed at boot

FROM node:22-slim AS builder
WORKDIR /app

# Install deps first so the layer caches when only source changes
COPY package.json package-lock.json* ./
RUN npm ci

# Copy the rest and build the SPA into dist/public
COPY . .
RUN npm run build

# Strip dev deps; we still need tsx + drizzle-kit at runtime so
# we keep the production install but drop devDependencies that
# only the build needed (eslint, vitest, @vitejs/plugin-react...)
RUN npm prune --production

# ---- Stage 2: runtime ----
FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

# Postgres client is useful for one-shot CREATE EXTENSION + reseed
# from inside the container. Tiny binary; worth the ~2MB.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates postgresql-client \
 && rm -rf /var/lib/apt/lists/*

# Copy only what the runtime needs (no test files, no .git, etc.).
# .dockerignore handles the exclusions.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist          ./dist
COPY --from=builder /app/server        ./server
COPY --from=builder /app/shared        ./shared
COPY --from=builder /app/scripts       ./scripts
COPY --from=builder /app/packages      ./packages
COPY --from=builder /app/package.json  ./

EXPOSE 10000
CMD ["npx", "tsx", "server/index.ts"]
