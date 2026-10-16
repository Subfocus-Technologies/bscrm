FROM oven/bun:1.3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
# The @crm/db postinstall runs `prisma generate`, whose config insists on a
# DATABASE_URL. Generating needs no connection, so any well-formed URL will do.
RUN DATABASE_URL=postgresql://build@localhost:5432/build bun install --frozen-lockfile
WORKDIR /app/apps/api
ENV NODE_ENV=production
CMD ["bun", "src/main.ts"]
