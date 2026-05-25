# syntax=docker/dockerfile:1

# Build frontend
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# Install backend deps + run server
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Sharp SVG rendering can require fontconfig/fonts (even if you embed fonts)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fontconfig \
    fonts-noto-core \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . ./

# Copy built frontend into the location expected by server.js
COPY --from=frontend-build /app/frontend/build ./frontend/build

EXPOSE 5000

# Default entrypoint uses server.js (package.json "start")
CMD ["npm", "start"]
