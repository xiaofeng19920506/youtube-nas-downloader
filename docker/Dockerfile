# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm install --prefix server --include=dev && npm install --prefix web --include=dev
COPY server/tsconfig.json ./server/
COPY server/src ./server/src
COPY web/tsconfig.json web/vite.config.ts web/index.html ./web/
COPY web/src ./web/src
RUN npm --prefix web run build && npm --prefix server run build

FROM node:22-bookworm-slim
COPY docker/install-media.sh /tmp/install-media.sh
RUN sed -i 's/\r$//' /tmp/install-media.sh && chmod +x /tmp/install-media.sh && /tmp/install-media.sh
WORKDIR /app/server
ENV NODE_ENV=production
ENV PORT=4010
ENV MEDIA_ROOT=/data/media
ENV SHARES_ROOT=/data/shares
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp
ENV WEB_DIST_DIR=/app/web/dist
COPY --from=build /repo/server/dist ./dist
COPY --from=build /repo/server/package.json ./package.json
COPY --from=build /repo/web/dist /app/web/dist
RUN npm install --omit=dev
EXPOSE 4010
CMD ["node", "dist/index.js"]
