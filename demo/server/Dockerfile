FROM --platform=linux/amd64 node:22-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY packages/react/package.json packages/react/
COPY demo/package.json demo/
COPY demo/frontend/package.json demo/frontend/
COPY demo/server/package.json demo/server/
RUN pnpm install --frozen-lockfile --filter tatefude-demo-server

COPY demo/server/tsconfig.json demo/server/
COPY demo/server/src demo/server/src

WORKDIR /repo/demo/server
RUN pnpm smoke && rm -f /tmp/minitype-smoke-*.pdf

FROM --platform=linux/amd64 node:22-bookworm-slim

COPY --from=build /repo /repo
WORKDIR /repo/demo/server

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["node", "--experimental-strip-types", "src/server.ts"]
