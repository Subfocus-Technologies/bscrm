FROM oven/bun:1.4.4-slim
WORKDIR /app
COPY railway/cron.ts .
CMD ["bun", "cron.ts"]
