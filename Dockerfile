# Build the Phaser bundle, then bake it into a private nginx image served from the games cluster.
# Cloudflare sits in front only as DNS/CDN — the app is hosted on your infra. Bases come from the
# private Forgejo mirror (estate rule: no public registries). Matches save-api/spriteforge Dockerfiles.
FROM forgejo.andusystems.com/andusystems/mirror/node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# nginx-unprivileged: runs as uid 101 on :8080, non-root — satisfies the estate's Kyverno baseline.
FROM forgejo.andusystems.com/andusystems/mirror/nginxinc/nginx-unprivileged:stable
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
