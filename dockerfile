# Stage 1: Install dependencies
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the SvelteKit application
FROM node:24-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application with the Node.js adapter
RUN npm run build

# Prune dev dependencies after build
RUN npm prune --omit=dev

# Stage 3: Production runtime
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup -S -g 1001 sveltekit
RUN adduser -S -u 1001 -G sveltekit sveltekit

# Copy the built application
COPY --from=builder --chown=sveltekit:sveltekit /app/build ./build

# Copy production dependencies
COPY --from=builder --chown=sveltekit:sveltekit /app/node_modules ./node_modules

# Copy package.json for module resolution
COPY --chown=sveltekit:sveltekit package.json .

USER sveltekit

EXPOSE 5173
ENV PORT=5173
ENV HOST=0.0.0.0

# Start the SvelteKit server
CMD ["node", "build/index.js"]