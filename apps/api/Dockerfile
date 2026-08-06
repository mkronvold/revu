FROM node:26-bookworm-slim@sha256:679fdd370deac03f6e5189b0670d5b723a6e3ffee3a4045a9cbed41164c01c7c AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci

COPY apps/api apps/api
COPY packages/contracts packages/contracts

RUN npm run build --workspace @revu/contracts \
  && npm run build --workspace @revu/api

FROM node:26-bookworm-slim@sha256:679fdd370deac03f6e5189b0670d5b723a6e3ffee3a4045a9cbed41164c01c7c AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/apps/api/package.json apps/api/package.json
COPY --from=builder /app/packages/contracts/package.json packages/contracts/package.json
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/packages/contracts/dist packages/contracts/dist

EXPOSE 4000

CMD ["node", "apps/api/dist/index.js"]
