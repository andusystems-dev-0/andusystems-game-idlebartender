# Making a game

The template gives you a working Phaser game that already saves. Your job is the gameplay; the
platform handles saves, identity, payments, web hosting, and the store apps.

## 1. Clone
```bash
gh repo create andusystems-dev-0/andusystems-game-<slug> \
  --template andusystems-dev-0/andusystems-games-template --public
```

## 2. Configure (`game.json`)
```json
{
  "slug": "<slug>",
  "name": "Display Name",
  "bundleId": "com.andusystems.games.<slug>",
  "orientation": "portrait",
  "icon": "spriteforge:<asset-id>",
  "splash": "spriteforge:<asset-id>"
}
```
Set `gameId` + API base in `.env.uat` / `.env.prod` (defaults point at `uat-api…` / `api…`).

## 3. Build the game
Write Phaser in `src/`. Persist with the SDK — never touch the API or storage directly:
```ts
import { AnduGames } from '@andusystems/games-sdk'
const games = AnduGames.init({ gameId: '<slug>', env: import.meta.env.MODE })
// on state change:
games.save(myState)                 // local-first + debounced sync
// on boot:
const saved = await games.load()
// gate purchased content:
const ents = await games.entitlements()
```
The template already flushes on `visibilitychange`/`pagehide` and Capacitor pause — leave it wired.

## 4. Register the game
PR the game into `andusystems-games/apps/save-api/games-registry.yaml` (save mode + caps) and, if it
sells anything, `products.yaml`. See `andusystems-games/docs/onboarding-a-game.md`.

## 5. Ship
Push → CI builds the web bundle once → UAT (Pangolin, TestFlight/Play-internal). After sign-off,
promote the same artifact → prod (Cloudflare, store production). You write **no** native or server code.

## Rules of thumb
- Version your save blob's format inside the blob; the server treats it as opaque bytes.
- Keep the build offline-capable — the store shell runs it with no network.
- Digital purchases are **web-first**; the app unlocks via entitlements (store policy).
