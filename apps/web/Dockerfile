FROM node:26-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS builder

WORKDIR /app

ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_COMPANY_NAME=Your Company
ENV VITE_COMPANY_NAME=$VITE_COMPANY_NAME
ARG VITE_ENABLE_QUESTION_SET_STATUS=false
ENV VITE_ENABLE_QUESTION_SET_STATUS=$VITE_ENABLE_QUESTION_SET_STATUS

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci

COPY apps/web apps/web
COPY packages/contracts packages/contracts

RUN npm run build --workspace @revu/contracts \
  && npm run build --workspace @revu/web

FROM nginx:1.31-alpine@sha256:785835ea65db4bba6f021acc0f3be91b0fef76a53fe41f8588c6698d2aed0606

ARG APP_REVISION=
ENV APP_REVISION=$APP_REVISION

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.d/40-revu-config.sh
RUN chmod +x /docker-entrypoint.d/40-revu-config.sh

EXPOSE 3000
