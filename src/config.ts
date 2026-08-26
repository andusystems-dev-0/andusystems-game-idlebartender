import Phaser from "phaser";

// ── Rendering / layout ──────────────────────────────────────────────────────
// Supersample: render at SS× the design resolution, then let ENVELOP downsample to the screen for crisp
// art + anti-aliasing. All positions/speeds below are in design units × SS so gameplay is unchanged.
export const SS = 2;
export const DESIGN = { w: 720 * SS, h: 1280 * SS };
export const CENTER_X = DESIGN.w / 2;

// Playable wooden bar, a perspective trapezoid measured from the background art.
export const TABLE = {
  nearY: 1140 * SS, // bottom (launch/rest)
  farY: 334 * SS, // top (counter)
  nearHalf: 355 * SS,
  farHalf: 170 * SS,
  nearScale: 0.36 * SS,
  farScale: 0.15 * SS,
};

// Flick + glide feel.
export const FLICK = {
  window: 120,
  minSpeed: 400 * SS,
  boost: 0.4,
  maxSpeed: 1250 * SS,
  friction: 0.98,
  settleSpeed: 12 * SS,
  launchRange: 260 * SS,
  restitution: 0.6,
  radius: 0.42,
};

export const TIER_SCALE_MIN = 0.5;
export const TIER_SCALE_MAX = 1.5;

// ── Drinks ──────────────────────────────────────────────────────────────────
// 25 tiers. The first REAL_ART_TIERS use real art (drink1..drinkN); the rest get generated placeholder
// glasses so the whole ladder is playable now — real art can be dropped in later by name.
export const DRINK_NAMES = [
  "Shot", "Sour Splash", "Spritz", "Tiki Cup", "Fruit Punch", "Moscow Mule", "Martini", "Negroni",
  "Sangria", "Daiquiri", "Margarita", "Mojito", "Cosmopolitan", "Old Fashioned", "Manhattan", "Zombie",
  "Hurricane", "Mai Tai", "Piña Colada", "Long Island", "Aviation", "Last Word", "Corpse Reviver",
  "Golden Cadillac", "The Last Call",
];
export const MAX_TIER = DRINK_NAMES.length - 1;
export const REAL_ART_TIERS = 4;
export const TIER_TEX = DRINK_NAMES.map((_, i) => `drink${i + 1}`);

export function tierColor(tier: number): number {
  return Phaser.Display.Color.HSVToRGB(tier / (MAX_TIER + 1), 0.72, 0.98).color;
}
export function tierColorStr(tier: number): string {
  return "#" + tierColor(tier).toString(16).padStart(6, "0");
}

// ── Economy ─────────────────────────────────────────────────────────────────
export const BASE_SPAWN_DECAY = 0.2; // each higher tier this fraction as likely to be flicked
export const BASE_CAPACITY = 12;

export const VALUE_BASE = 3;
export const VALUE_GROWTH = 2.35;
export function drinkValue(tier: number): number {
  if (tier <= 0) return 0;
  return Math.round(VALUE_BASE * Math.pow(VALUE_GROWTH, tier - 1));
}

export const COMBO = { windowMs: 3000, step: 0.2, maxStacks: 25 };

export const PRESTIGE = {
  tierGate: 11, // must create at least this drink tier in a run before you can close out ("Last Call")
  scoreDivisor: 1e4, // tokens ≈ sqrt(runScore / divisor)
  offlineCapHours: 8,
};

// ── Upgrades (spend coins, reset on prestige) ───────────────────────────────
export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  baseCost: number;
  costMul: number;
  max: number;
}
export const UPGRADES: UpgradeDef[] = [
  { id: "pour", name: "Stronger Pour", desc: "+25% coins from every merge", baseCost: 20, costMul: 1.5, max: 60 },
  { id: "combo", name: "Happy Hour", desc: "Bigger, longer combo multiplier", baseCost: 60, costMul: 1.7, max: 40 },
  { id: "shelf", name: "Top Shelf", desc: "Better odds of higher drinks", baseCost: 150, costMul: 1.85, max: 15 },
  { id: "bar", name: "Bigger Bar", desc: "+2 drink capacity on the table", baseCost: 120, costMul: 1.9, max: 12 },
  { id: "garnish", name: "Lucky Garnish", desc: "+4% chance a merge pays double", baseCost: 250, costMul: 1.7, max: 20 },
  { id: "autobar", name: "Auto-Bartender", desc: "Flicks drinks for you — faster/level", baseCost: 500, costMul: 1.55, max: 25 },
  { id: "server", name: "Auto-Server", desc: "Serves your best drinks for coins", baseCost: 900, costMul: 1.6, max: 25 },
];

// ── Prestige boons (roguelike draft — pick 1 each Last Call, they stack forever) ─
export interface BoonDef {
  id: string;
  name: string;
  desc: string;
}
export const BOONS: BoonDef[] = [
  { id: "double", name: "Double Pour", desc: "x2 coins from merges (stacks)" },
  { id: "golden", name: "Golden Start", desc: "Begin each run with a coin stash" },
  { id: "chain", name: "Chain Master", desc: "+40% combo duration" },
  { id: "overflow", name: "Overflow", desc: "+3 table capacity" },
  { id: "alchemist", name: "Alchemist", desc: "+10% double-merge chance" },
  { id: "rapid", name: "Rapid Hands", desc: "Auto-Bartender 30% faster" },
  { id: "cheap", name: "Cheapskate", desc: "Upgrades 15% cheaper" },
  { id: "highroller", name: "High Roller", desc: "Far better high-drink odds" },
  { id: "midas", name: "Midas Touch", desc: "+60% ALL coin gain" },
];

// ── Meta upgrades (spend prestige tokens, permanent across runs) ─────────────
export const META: UpgradeDef[] = [
  { id: "legacy", name: "Legacy", desc: "+15% all coins, permanently", baseCost: 1, costMul: 2, max: 25 },
  { id: "nestegg", name: "Nest Egg", desc: "Start runs with more coins", baseCost: 1, costMul: 2, max: 20 },
  { id: "connoisseur", name: "Connoisseur", desc: "+1 boon choice at Last Call", baseCost: 3, costMul: 4, max: 3 },
  { id: "reputation", name: "Reputation", desc: "+20% tokens earned per Last Call", baseCost: 2, costMul: 3, max: 15 },
];
