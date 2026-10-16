FROM oven/bun:1.3.12-slim
WORKDIR /app
COPY railway/cron.ts .
CMD ["bun", "cron.ts"]
