FROM node:20-alpine AS builder

WORKDIR /usr/src/app

RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
COPY prisma ./prisma/
COPY tsconfig.json ./
COPY src ./src/

RUN npm ci --legacy-peer-deps

# IMPORTANT FIX: explicit schema path
RUN npx prisma generate --schema=./prisma/schema.prisma

RUN npm run build


FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
COPY prisma ./prisma/
COPY --from=builder /usr/src/app/dist ./dist

RUN npm ci --omit=dev --legacy-peer-deps

USER node

EXPOSE 5000

CMD ["npm", "start"]