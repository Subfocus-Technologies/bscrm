FROM oven/bun:1.4.4-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN DATABASE_URL=postgresql://build@localhost:5432/build bun install --frozen-lockfile
WORKDIR /app/apps/api
ENV NODE_ENV=production
CMD ["bun", "src/main.ts"]
