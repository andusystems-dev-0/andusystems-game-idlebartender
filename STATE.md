# andusystems-games-template — state

_Last updated: 2026-08-21._

## Status: PLANNING — no code yet
Built in **ROADMAP Phase 4** (depends on the SDK, Phase 3). Store wiring lands with **Phase 6**.

## Build order
1. Phaser + Vite + TS scaffold with a tiny demo game that saves via the SDK.
2. `game.json` + `.env.{uat,prod}` config; lifecycle flush wiring.
3. `ci.yml`: build web once → publish uat/prod (R2) → call `mobile-package.yml`.
4. Mark the repo as a GitHub **template**; verify `gh repo create --template` yields a green build.

## Open
- Demo game scope (keep it trivial but exercise save + entitlement gating).
- Icon/splash generation hook into SpriteForge (`game.json.icon` → asset id).
