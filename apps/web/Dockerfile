FROM node:26-bookworm-slim@sha256:28147155d47dc31abe0a46e0d12b59b2fb3d0a2dcc5dc65fce76a074180b16fe AS builder

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

FROM nginx:1.31-alpine@sha256:a3554c0d0b48177b1413c26e01f695334428020d9df01243fbae3e11cfd17417

ARG APP_REVISION=
ENV APP_REVISION=$APP_REVISION

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.d/40-revu-config.sh
RUN chmod +x /docker-entrypoint.d/40-revu-config.sh

EXPOSE 3000
