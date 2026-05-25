# ==========================================
# STAGE 1: Build & Compile TypeScript
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency mappings
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies including dev dependencies to enable compilation
RUN npm ci --legacy-peer-deps

# Copy TypeScript source code
COPY tsconfig.json ./
COPY src ./src/

# Compile TypeScript to JavaScript and build Prisma client
RUN npx prisma generate
RUN npm run build

# Remove development dependencies to keep image lean
RUN npm prune --production --legacy-peer-deps

# ==========================================
# STAGE 2: Production Runtime Environment
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copy built assets and production node_modules from builder
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma

# Standardize running on non-root user for security
USER node

EXPOSE 5000

CMD ["node", "dist/index.js"]
