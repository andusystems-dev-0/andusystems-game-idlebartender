# AGENTS.md — andusystems-games-template

The starter every game is cloned from. Keep it **minimal, generic, and correct** — bloat here is
inherited by every game. Read `docs/making-a-game.md`.

## Rules
1. **Web bundle is the only artifact.** No native code, no server code. Mobile = the shared shell
   (`andusystems-games/mobile/shell`) fed this bundle; never scaffold per-game native projects.
2. **One config file.** All per-game variation lives in `game.json` + `.env.{uat,prod}`. Don't
   spread config through the source.
3. **SDK does persistence.** Games call the SDK; they never talk to the API directly or hand-roll
   storage. Wire the lifecycle flush once in the template.
4. **Store-compliant by default.** Any "buy" UI uses `entitlements()` to gate content and, on web
   only, `checkoutUrl()`. Never ship an in-app Stripe purchase for digital goods.
5. **Env-correct.** `.env.uat` → `uat-api…`, `.env.prod` → `api…`; the CI picks the env per lane.
6. **Deterministic builds.** Content-hashed assets, SPA fallback, offline-capable (the shell
   bundles the output — it must run with no network).

## Shape
`src/` (Phaser game), `game.json`, `.env.{uat,prod}.example`, `public/`, `.github/workflows/ci.yml`
(build once → publish web → call `andusystems-games` `mobile-package.yml`). Ship a tiny working
demo game so a fresh clone builds and saves out of the box.
