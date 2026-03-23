# Stage 1: Build
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app/backend

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .
RUN npm run build
RUN npx prisma generate

# Stage 2: Run
FROM node:20-alpine

RUN apk add --no-cache openssl coreutils su-exec chromium nss freetype harfbuzz ca-certificates ttf-freefont libsecret

WORKDIR /app/backend

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev

# Install Claude Code and Gemini CLI globally
RUN npm install -g @anthropic-ai/claude-code @google/gemini-cli

# Copy compiled output and generated Prisma client
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules/.prisma ./node_modules/.prisma

RUN npx prisma generate

# Create output directory and set ownership for non-root user
RUN mkdir -p /app/ai-workspace/output && chown -R node:node /app

# Run as non-root (required by Claude Code's --dangerously-skip-permissions)
USER node

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
