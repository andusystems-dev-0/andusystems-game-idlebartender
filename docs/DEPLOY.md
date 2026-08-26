# Deploying Idle Bartender

Idle Bartender is hosted on **your own infra** — the games k3s cluster — **not Cloudflare Pages**.
Cloudflare only does **DNS + CDN** in front. All pipelines are **GitHub Actions**; Forgejo is the
private **container registry** (it is *not* a CI system — no Forgejo Actions).

## Architecture
```
player → idlebartender.com → Cloudflare (DNS + CDN, proxied, SSL mode: Full)
                                   │
                                   ▼
              Pangolin resource (TCP-pass :443 → 10.238.70.50, games newt)
                                   │
                                   ▼
                 games-cluster Traefik  →  IngressRoute Host(`idlebartender.com`)
                                   │
                                   ▼
              ns games-web → nginx Deployment (baked-in Phaser bundle)
```

- **Image:** the game is built into a private nginx image with the Phaser bundle baked in
  (`Dockerfile`, Forgejo-mirror bases) → `forgejo.andusystems.com/andusystems/game-idlebartender:<git-sha>`.
- **Build (GitHub Actions):** `.github/workflows/image.yml` on the self-hosted runner
  (`gha-idlebartender-*` on the runner VM) pushes the image to Forgejo. Needs repo secrets
  `FORGEJO_USER` / `FORGEJO_TOKEN`.
- **Deploy (GitOps/ArgoCD):** the games cluster runs it via ArgoCD app `games-idlebartender`, sourced
  from `andusystems-games/apps/game-idlebartender` (Deployment + Service + Traefik IngressRoute). The
  image is **SHA-pinned** so ArgoCD rolls a specific build.
- **Exposure:** a Pangolin resource TCP-passes :443 to the games Traefik VIP `10.238.70.50`; Cloudflare
  proxies `idlebartender.com` (CDN) with SSL/TLS mode **Full**.

## Deploy a new version (after code changes)
1. **Push to `main`** → the **`image`** GitHub Actions workflow builds + pushes
   `game-idlebartender:<new-sha>` to Forgejo. (Auto-triggers on changes to `src/`, `public/`,
   `index.html`, `package*.json`, `vite.config.ts`, `tsconfig.json`, `Dockerfile`, `nginx.conf`; or run
   it manually: `gh workflow run image.yml`.)
2. **Bump the SHA** in `andusystems-games/apps/game-idlebartender/resources.yaml`
   (`game-idlebartender:<new-sha>`) and commit/push → ArgoCD (mgmt hub) rolls it onto the games cluster.

Cloudflare / Pangolin / DNS need **no** changes on a code update. Hashed asset filenames mean the CDN
never serves stale JS; `index.html` is served `no-cache` so a new build shows up immediately.

## First-time exposure (already done — for reference)
- **Pangolin:** resource for `idlebartender.com` → TCP-pass :443 → `10.238.70.50` via the games newt.
- **Cloudflare:** `idlebartender.com` DNS proxied at the Pangolin endpoint; SSL/TLS mode **Full**;
  remove the old `idlebartender` **Pages** project's custom domain.
