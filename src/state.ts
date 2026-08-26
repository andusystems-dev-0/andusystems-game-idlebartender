import Phaser from "phaser";
import {
  UPGRADES, BOONS, META, BASE_SPAWN_DECAY, BASE_CAPACITY, MAX_TIER, drinkValue, COMBO, PRESTIGE,
} from "./config";

// Cross-scene event bus (merge/serve/prestige/buy).
export const bus = new Phaser.Events.EventEmitter();

const SAVE_KEY = "idlebartender.save.v1";

// ── Persistent state ────────────────────────────────────────────────────────
export interface Persist {
  coins: number;
  runScore: number; // score this run — drives prestige tokens
  totalScore: number; // lifetime
  bestTierEver: number;
  bestTierRun: number;
  upgrades: Record<string, number>;
  prestige: { tokens: number; runs: number; boons: string[]; meta: Record<string, number> };
  lastSeen: number;
  seenIntro: boolean;
}

function fresh(): Persist {
  return {
    coins: 0,
    runScore: 0,
    totalScore: 0,
    bestTierEver: 0,
    bestTierRun: 0,
    upgrades: {},
    prestige: { tokens: 0, runs: 0, boons: [], meta: {} },
    lastSeen: 0,
    seenIntro: false,
  };
}

export const S: Persist = fresh();
// Transient (not saved): combo tracking, last-offline result, modal flag, safe-area insets (design px).
export const T = {
  comboCount: 0,
  lastMergeMs: -1e9,
  offlineEarned: 0,
  offlineSeconds: 0,
  modalOpen: false,
  safeTop: 0,
  safeBottom: 0,
};

// ── Save / load / offline ───────────────────────────────────────────────────
export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persist>;
      Object.assign(S, fresh(), p, {
        prestige: { ...fresh().prestige, ...(p.prestige || {}) },
        upgrades: { ...(p.upgrades || {}) },
      });
    }
  } catch {
    /* corrupt save → start fresh */
  }

  const now = Date.now();
  if (S.lastSeen > 0) {
    const elapsed = Math.max(0, (now - S.lastSeen) / 1000);
    const capped = Math.min(elapsed, PRESTIGE.offlineCapHours * 3600);
    const earned = Math.floor(idleCoinsPerSec() * capped);
    if (earned > 0) {
      S.coins += earned;
      S.runScore += earned;
      S.totalScore += earned;
      T.offlineEarned = earned;
      T.offlineSeconds = capped;
    }
  }
  S.lastSeen = now;
  save();
}

export function save() {
  S.lastSeen = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(S));
  } catch {
    /* storage full/blocked — ignore */
  }
}

// ── Level / cost helpers ────────────────────────────────────────────────────
export const lvl = (id: string) => S.upgrades[id] || 0;
export const metaLvl = (id: string) => S.prestige.meta[id] || 0;
export const boonCount = (id: string) => S.prestige.boons.filter((b) => b === id).length;

export function upgradeCost(id: string): number {
  const def = UPGRADES.find((u) => u.id === id)!;
  const cheap = Math.pow(0.85, boonCount("cheap"));
  return Math.ceil(def.baseCost * Math.pow(def.costMul, lvl(id)) * cheap);
}
export function metaCost(id: string): number {
  const def = META.find((u) => u.id === id)!;
  return Math.ceil(def.baseCost * Math.pow(def.costMul, metaLvl(id)));
}
export function upgradeMaxed(id: string): boolean {
  return lvl(id) >= UPGRADES.find((u) => u.id === id)!.max;
}
export function metaMaxed(id: string): boolean {
  return metaLvl(id) >= META.find((u) => u.id === id)!.max;
}

// ── Derived effects ─────────────────────────────────────────────────────────
export function globalCoinMult(): number {
  const pour = 1 + 0.25 * lvl("pour");
  const midas = Math.pow(1.6, boonCount("midas"));
  const legacy = 1 + 0.15 * metaLvl("legacy");
  const doublePour = Math.pow(2, boonCount("double"));
  const prestigeBonus = 1 + 0.02 * S.prestige.runs;
  return pour * midas * legacy * doublePour * prestigeBonus;
}
export function capacity(): number {
  return BASE_CAPACITY + 2 * lvl("bar") + 3 * boonCount("overflow");
}
export function critChance(): number {
  return Math.min(0.9, 0.04 * lvl("garnish") + 0.1 * boonCount("alchemist"));
}
export function spawnDecay(): number {
  return Math.min(0.72, BASE_SPAWN_DECAY + 0.03 * lvl("shelf") + 0.06 * boonCount("highroller"));
}
export function comboWindowMs(): number {
  return COMBO.windowMs * (1 + 0.06 * lvl("combo")) * (1 + 0.4 * boonCount("chain"));
}
export function comboStep(): number {
  return COMBO.step + 0.03 * lvl("combo");
}
export function comboMult(nowMs: number): number {
  if (nowMs - T.lastMergeMs > comboWindowMs()) return 1;
  return 1 + Math.min(T.comboCount, COMBO.maxStacks) * comboStep();
}
export function comboActive(nowMs: number): boolean {
  return nowMs - T.lastMergeMs <= comboWindowMs() && T.comboCount >= 2;
}

export const autobarEnabled = () => lvl("autobar") > 0;
export function autobarInterval(): number {
  const rapid = Math.pow(0.7, boonCount("rapid"));
  return Math.max(600, (4000 - 120 * (lvl("autobar") - 1)) * rapid);
}
export const serverEnabled = () => lvl("server") > 0;
export function serverInterval(): number {
  return Math.max(1200, 6000 - 180 * (lvl("server") - 1));
}
export function serveValueMult(): number {
  return 0.5 + 0.06 * lvl("server");
}

// Approximate passive income (offline earnings + HUD "/s" readout).
export function idleCoinsPerSec(): number {
  let rate = 0;
  if (serverEnabled()) {
    const per = drinkValue(Math.max(1, S.bestTierRun - 1)) * serveValueMult() * globalCoinMult();
    rate += per / (serverInterval() / 1000);
  }
  if (autobarEnabled()) {
    const per = drinkValue(Math.max(1, Math.floor(S.bestTierRun / 2))) * globalCoinMult();
    rate += (per * 0.5) / (autobarInterval() / 1000);
  }
  return rate;
}

// ── Actions ─────────────────────────────────────────────────────────────────
export function rollSpawnTier(): number {
  const decay = spawnDecay();
  const weights: number[] = [];
  let w = 1;
  for (let t = 0; t <= MAX_TIER; t++) {
    weights.push(w);
    w *= decay;
  }
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let t = 0; t < weights.length; t++) {
    r -= weights[t];
    if (r < 0) return t;
  }
  return 0;
}

export function registerMerge(newTier: number, nowMs: number) {
  if (nowMs - T.lastMergeMs <= comboWindowMs()) T.comboCount++;
  else T.comboCount = 1;
  T.lastMergeMs = nowMs;

  const cMult = 1 + Math.min(T.comboCount, COMBO.maxStacks) * comboStep();
  let coins = drinkValue(newTier) * globalCoinMult() * cMult;
  const crit = Math.random() < critChance();
  if (crit) coins *= 2;
  coins = Math.max(1, Math.floor(coins));

  S.coins += coins;
  S.runScore += coins;
  S.totalScore += coins;
  if (newTier > S.bestTierRun) S.bestTierRun = newTier;
  if (newTier > S.bestTierEver) S.bestTierEver = newTier;

  bus.emit("merge", { tier: newTier, coins, crit, comboCount: T.comboCount });
  return { coins, crit, comboCount: T.comboCount };
}

export function serveDrink(tier: number): number {
  const coins = Math.max(1, Math.floor(drinkValue(tier) * serveValueMult() * globalCoinMult()));
  S.coins += coins;
  S.runScore += coins;
  S.totalScore += coins;
  bus.emit("serve", { tier, coins });
  return coins;
}

export function buyUpgrade(id: string): boolean {
  if (upgradeMaxed(id)) return false;
  const c = upgradeCost(id);
  if (S.coins < c) return false;
  S.coins -= c;
  S.upgrades[id] = lvl(id) + 1;
  bus.emit("buy", { id });
  save();
  return true;
}
export function buyMeta(id: string): boolean {
  if (metaMaxed(id)) return false;
  const c = metaCost(id);
  if (S.prestige.tokens < c) return false;
  S.prestige.tokens -= c;
  S.prestige.meta[id] = metaLvl(id) + 1;
  bus.emit("buyMeta", { id });
  save();
  return true;
}

// ── Prestige ("Last Call") ──────────────────────────────────────────────────
export function canPrestige(): boolean {
  return S.bestTierRun >= PRESTIGE.tierGate;
}
export function prestigeTokens(): number {
  const base = Math.floor(Math.sqrt(S.runScore / PRESTIGE.scoreDivisor));
  return Math.max(0, Math.floor(base * (1 + 0.2 * metaLvl("reputation"))));
}
export function draftBoons() {
  const n = 3 + metaLvl("connoisseur");
  const pool = [...BOONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length));
}
export function doPrestige(chosenBoonId: string): number {
  const tokens = prestigeTokens();
  S.prestige.tokens += tokens;
  S.prestige.runs += 1;
  if (chosenBoonId) S.prestige.boons.push(chosenBoonId);

  // reset the run
  S.coins = 0;
  S.runScore = 0;
  S.bestTierRun = 0;
  S.upgrades = {};
  T.comboCount = 0;
  T.lastMergeMs = -1e9;

  // starting bonuses
  const golden = boonCount("golden");
  if (golden > 0) S.coins += 100 * Math.pow(5, golden - 1);
  S.coins += metaLvl("nestegg") * 250;

  bus.emit("prestige", { tokens });
  save();
  return tokens;
}
