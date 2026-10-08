# ---------- Tầng 1: cài thư viện + tối ưu model ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY scripts ./scripts
COPY public/assets/animals.json ./public/assets/animals.json
COPY animal ./animal
RUN npm run models

# Bỏ thư viện chỉ dùng lúc build (gltf-transform)
RUN npm prune --omit=dev

# ---------- Tầng 2: chỉ chứa những gì cần để chạy ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json server.js ./
COPY src ./src
COPY games ./games
COPY public ./public
# Thư mục game upload qua /admin: gắn volume riêng (docker-compose.yml) nên build lại không mất; cho user node ghi được.
RUN mkdir -p /app/games-installed && chown node:node /app/games-installed

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1

CMD ["node", "server.js"]
