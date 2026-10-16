FROM node:24-slim
COPY --from=oven/bun:1.3.12-slim /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN DATABASE_URL=postgresql://build@localhost:5432/build bun install --frozen-lockfile
WORKDIR /app/apps/agent
RUN DATABASE_URL=postgresql://build@localhost:5432/build bun run build
ENV NODE_ENV=production
CMD ["sh", "-c", "exec node_modules/.bin/eve start --host :: --port ${PORT:-2000}"]
