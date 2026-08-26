# Idle Bartender — gameplay prototype

A drink-merging + idle game. Flick drinks up the bar; matching drinks combine into the next tier
(Suika-style); climb the ladder, earn coins, buy upgrades, and prestige ("Last Call") for permanent
roguelike boons.

## Core loop
1. **Flick** the drink at the bottom up the bar (skill-based; strength = distance).
2. **Merge** — two of the *same* drink that touch combine into the next tier; different drinks bounce.
3. **Earn** — every merge pays coins = `drinkValue(tier) × global multiplier × combo × crit`.
4. **Combo** — merges within a short window stack a multiplier (decays when you stop).
5. **Spend** coins in the **Shop** on upgrades.
6. **Idle** — Auto-Bartender flicks for you; Auto-Server sells your best drinks for passive coins;
   offline earnings accrue while away (capped).
7. **Prestige** — once you reach a milestone drink, "Last Call" resets the run for **⭐ tokens**,
   a **boon draft** (pick 1 of N, they stack forever), and permanent **Legacy** meta-upgrades.

## Systems & where to tune them
All tunables live in `src/config.ts`:

- **Drinks / ladder** — `DRINK_NAMES` (25 tiers; first `REAL_ART_TIERS` use real art, the rest are
  auto-generated placeholder glasses colored by tier). Add art by dropping `drinkN.png` in
  `src/assets` and raising `REAL_ART_TIERS`.
- **Value curve** — `VALUE_BASE`, `VALUE_GROWTH`, `drinkValue()`.
- **Combo** — `COMBO` (window, step, max stacks).
- **Spawn odds** — `BASE_SPAWN_DECAY` (exponential falloff; improved by the Top Shelf upgrade / High
  Roller boon).
- **Capacity** — `BASE_CAPACITY` (+ Bigger Bar / Overflow).
- **Upgrades** — `UPGRADES` (coin-spent, reset each run).
- **Boons** — `BOONS` (roguelike draft; stack across prestiges).
- **Meta** — `META` (token-spent, permanent).
- **Prestige** — `PRESTIGE` (`tierGate` = milestone drink to unlock Last Call, token formula, offline cap).
- **Feel / render** — `FLICK`, `TABLE`, `SS` (supersample), `TIER_SCALE_MIN/MAX`.

## Code map
- `src/config.ts` — all constants + content (drinks, upgrades, boons, meta).
- `src/state.ts` — save/load (localStorage), economy, combos, offline earnings, prestige. Pure logic.
- `src/BarScene.ts` — gameplay: flick/merge/bounce physics, effects (float text, particles, shake,
  pop), and the auto (idle) systems.
- `src/UIScene.ts` — HUD + Shop + Last Call/prestige + boon draft + welcome-back modal.
- `src/main.ts` — bootstrap, save-on-hide, viewport.

## Not yet built (next)
Deeper idle (per-tier passive generators), quests/objectives, audio, real art beyond tier 4, and
balance passes on the value/cost/prestige curves (current numbers are first-pass and meant to be tuned).
Save format is versioned via the `idlebartender.save.v1` key.
