# RootsGoods Financial Manager — production image
FROM node:20-bookworm-slim AS build
# Build tools needed to compile better-sqlite3's native addon
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server ./server
COPY public ./public

FROM node:20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
# Copy the built app (including the compiled node_modules) from the build stage
COPY --from=build /app /app
# Data lives on a mounted volume so it survives container restarts/upgrades
RUN mkdir -p /data && chown -R node:node /data /app
ENV DATA_DIR=/data
VOLUME ["/data"]
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/server.js"]
