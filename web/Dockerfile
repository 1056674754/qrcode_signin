# Intentionally off-image build/upload: no Sentry credential or source map enters a layer.
FROM node:20-alpine AS artifact-guard
WORKDIR /verify
COPY dist ./dist
COPY .monitoring-private/upload-receipt.json ./upload-receipt.json
COPY scripts/image-guard.cjs ./image-guard.cjs
RUN node image-guard.cjs

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=artifact-guard /verify/dist /usr/share/nginx/html
EXPOSE 80
