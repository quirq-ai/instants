# Instants: build once, serve on port 3000.
#   docker build -t instants .
#   docker run -p 3000:3000 instants
# To generate posts inside the container, mount research folders and give it a key:
#   docker run -p 3000:3000 -e ANTHROPIC_API_KEY=... \
#     -v "$PWD/.research-cache:/app/.research-cache" -v /path/to/research:/research instants

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
# Tools the generator uses: PDF text, video frames, git history.
RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils ffmpeg git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    INSTANTS_ROOTS=/research
COPY --from=build /app ./
RUN mkdir -p /research && chown -R node:node /app /research
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
