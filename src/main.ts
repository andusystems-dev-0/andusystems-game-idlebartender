import Phaser from "phaser";
import { DESIGN } from "./config";
import { BarScene } from "./BarScene";
import * as G from "./state";
import { initUI } from "./ui";

// Load the save (and grant offline earnings) before the game boots.
G.load();

// Fallback color (matches the bar art's bottom) shows only if the canvas somehow doesn't cover.
document.documentElement.style.background = "#c76914";
document.body.style.background = "#c76914";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#c76914",
  render: {
    antialias: true,
    antialiasGL: true,
    roundPixels: false,
    pixelArt: false,
    mipmapFilter: "LINEAR",
  },
  scale: {
    // #game is position:fixed inset:0 (fills the screen); ENVELOP covers it (crop sides in portrait).
    mode: Phaser.Scale.ENVELOP,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN.w,
    height: DESIGN.h,
  },
  scene: [BarScene],
});

// DOM/CSS UI overlay (HUD, shop, prestige) layered over the canvas.
initUI();

// Bring up cloud backup/sync in the background (local-first — never blocks boot). Reconciles with the
// save-api and adopts a newer cloud save if this device is behind (e.g. a fresh install + restore code).
void G.initCloud();

// Persist when the tab/app is backgrounded or closed.
const flush = () => G.save();
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush();
});
window.addEventListener("pagehide", flush);
window.addEventListener("beforeunload", flush);

// ── Scale mode by aspect: portrait fills (ENVELOP, crop sides), landscape pillarboxes (FIT, bars on the
// sides showing the full portrait) instead of zooming in on width. #game itself fills the screen via CSS.
const DESIGN_ASPECT = DESIGN.w / DESIGN.h;
const fit = () => {
  if (!game.scale) return;
  game.scale.scaleMode =
    window.innerWidth / Math.max(1, window.innerHeight) > DESIGN_ASPECT ? Phaser.Scale.FIT : Phaser.Scale.ENVELOP;
  game.scale.refresh();
};
game.events.once("ready", fit);
window.addEventListener("resize", fit);
window.addEventListener("orientationchange", () => window.setTimeout(fit, 200));
fit();

// ── Auto-update: a home-screen app resumes a cached page instead of reloading, so a new deploy can go
// unseen. When the app becomes visible, compare the live index.html bundle hash to the running one and
// reload if it changed. (State is saved, so a reload is safe.)
const loadedBundle =
  Array.from(document.querySelectorAll('script[type="module"][src]'))
    .map((s) => (s as HTMLScriptElement).src)
    .find((s) => /assets\/index-/.test(s)) || "";
async function checkForUpdate() {
  if (document.visibilityState !== "visible" || !loadedBundle) return;
  try {
    const html = await (await fetch(`./?_=${Date.now()}`, { cache: "no-store" })).text();
    const m = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
    if (m && !loadedBundle.endsWith(m[0])) {
      G.save();
      location.reload();
    }
  } catch {
    /* offline / fetch blocked — ignore */
  }
}
document.addEventListener("visibilitychange", checkForUpdate);
window.addEventListener("pageshow", checkForUpdate);

// iOS standalone grants the FULL-height viewport only to a scrollable document (see index.html body
// min-height). Nudge the scroll to 1px on load/rotate so the large viewport is applied immediately;
// #game is fixed and eats every touch, so there's nothing for the user to actually scroll.
const nudge = () => window.scrollTo(0, 1);
window.addEventListener("load", () => window.setTimeout(nudge, 50));
window.addEventListener("orientationchange", () => window.setTimeout(nudge, 250));
nudge();
