FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY . .
ARG VITE_API_URL=http://localhost:8080
ENV VITE_API_URL=$VITE_API_URL
RUN bun run build:dev

FROM oven/bun:1-alpine
WORKDIR /app
COPY --from=builder /app/.output ./.output
EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0
CMD ["bun", "run", ".output/server/index.mjs"]
