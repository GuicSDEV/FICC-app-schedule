# Web image (Next.js standalone server). Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg API_INTERNAL_URL=http://api:4000 -t ficc-web .
# The browser calls the API through this app (/api/v1 and /socket.io are proxied to
# API_INTERNAL_URL), so NEXT_PUBLIC_API_URL stays empty. Both are fixed at build time.
FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  TURBO_TELEMETRY_DISABLED=1 \
  NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ARG API_INTERNAL_URL
ARG NEXT_PUBLIC_API_URL=""
ENV API_INTERNAL_URL=$API_INTERNAL_URL \
  NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
  NEXT_OUTPUT=standalone
RUN test -n "$API_INTERNAL_URL" || (echo "Set the API_INTERNAL_URL build variable" && exit 1)
RUN pnpm turbo run build --filter=@ficc/web...

FROM public.ecr.aws/docker/library/node:22-bookworm-slim
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  HOSTNAME=0.0.0.0 \
  PORT=3000
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
