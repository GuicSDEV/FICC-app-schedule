# API image (NestJS). Build from the repository root:
#   docker build -f apps/api/Dockerfile -t ficc-api .
# The whole workspace stays in the image so migrations, `pnpm db:bootstrap` and the demo seed can
# run from the same container (Railway pre-deploy command / shell).
FROM public.ecr.aws/docker/library/node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  TURBO_TELEMETRY_DISABLED=1 \
  NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@ficc/api...

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "apps/api/dist/main"]
