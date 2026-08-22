# andusystems-games-template

The **GitHub template** for a new game. `gh repo create andusystems-game-<slug> --template …`
yields a buildable **Phaser** web game wired to the save SDK. The web bundle is the **only** thing
you build — web hosting *and* the store apps come from that one artifact (D-011/D-012).

> Private template repo; the **games it creates are public**. No secrets here.

## What you get
- Phaser 3 + Vite scaffold, TypeScript.
- `@andusystems/games-sdk` wired: local-first save, anonymous identity, entitlements.
- `game.json` — the only per-game config: `slug`, display name, bundle id
  `com.andusystems.games.<slug>`, icon/splash (a SpriteForge asset), orientation.
- `.env.uat` / `.env.prod` — API base + `gameId` per env.
- Save-lifecycle wiring (web `visibilitychange`/`pagehide` + Capacitor `App` pause) → SDK flush.
- CI that builds the web bundle once and: publishes UAT (R2 `uat/` behind Pangolin) → prod (R2
  `prod/` on Cloudflare), and calls the shared `mobile-package.yml` for the stores.

## You do NOT write
Native/mobile code (the store wrapper is the generic shell in `andusystems-games/mobile/shell`),
server code (all games share the save-api), or a backend of any kind. Just the game.

## Make a game
See [`docs/making-a-game.md`](docs/making-a-game.md) and
`andusystems-games/docs/onboarding-a-game.md`.
