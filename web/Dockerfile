FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm config set registry https://registry.npmmirror.com && npm install

COPY . .

ARG VITE_POCKETBASE_URL=
ARG VITE_AUTH_MODE=wecom
ARG VITE_WECOM_CORP_ID=
ARG VITE_WECOM_AGENT_ID=
ARG VITE_OAUTH_PROVIDER=oidc
ENV VITE_POCKETBASE_URL=$VITE_POCKETBASE_URL
ENV VITE_AUTH_MODE=$VITE_AUTH_MODE
ENV VITE_WECOM_CORP_ID=$VITE_WECOM_CORP_ID
ENV VITE_WECOM_AGENT_ID=$VITE_WECOM_AGENT_ID
ENV VITE_OAUTH_PROVIDER=$VITE_OAUTH_PROVIDER

RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
