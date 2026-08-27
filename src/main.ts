import Phaser from "phaser";
import { DESIGN } from "./config";
import { BarScene } from "./BarScene";
import * as G from "./state";
import { initUI } from "./ui";
import bgUrl from "./assets/background.jpg";

// Load the save (and grant offline earnings) before the game boots.
G.load();

// Paint the bar art behind everything — on the ROOT + body, filling the ENTIRE viewport. The canvas is
// TRANSPARENT (below), so any pixel the game doesn't draw shows this beach instead of a flat color bar.
const pageBg = `#c76914 url(${bgUrl}) top center / cover no-repeat`;
document.documentElement.style.background = pageBg;
document.body.style.background = pageBg;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  // Transparent canvas: no solid background color can ever show as a bar; uncovered pixels reveal the
  // page's beach image instead.
  transparent: true,
  render: {
    antialias: true,
    antialiasGL: true,
    roundPixels: false,
    pixelArt: false,
    mipmapFilter: "LINEAR",
  },
  scale: {
    mode: Phaser.Scale.ENVELOP,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN.w,
    height: DESIGN.h,
  },
  scene: [BarScene],
});

// DOM/CSS UI overlay (HUD, shop, prestige) layered over the canvas.
initUI();

// Persist when the tab/app is backgrounded or closed.
const flush = () => G.save();
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush();
});
window.addEventListener("pagehide", flush);
window.addEventListener("beforeunload", flush);

// ── Viewport ─────────────────────────────────────────────────────────────────
// Read a CSS env(safe-area-inset-*) value in CSS pixels (Dynamic Island / notch / home indicator).
const cssInset = (name: "top" | "bottom"): number => {
  const d = document.createElement("div");
  d.style.cssText = `position:fixed;visibility:hidden;padding-top:env(safe-area-inset-${name});`;
  document.body.appendChild(d);
  const v = parseFloat(getComputedStyle(d).paddingTop) || 0;
  d.remove();
  return v;
};

const isStandalone = () =>
  (navigator as unknown as { standalone?: boolean }).standalone === true ||
  (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);

const fitViewport = () => {
  const el = document.getElementById("game");
  if (el) {
    const ih = window.innerHeight;
    const sh = (typeof screen !== "undefined" && screen.height) || ih;
    // In the home-screen app, innerHeight can report SHORTER than the physical screen (it subtracts the
    // notch/home-indicator when not in cover mode) — that shortfall is the bottom bar. Size to the true
    // device height (screen.height) so the container reaches the physical bottom; ENVELOP then covers it
    // (cropping the sides). In the browser, use the visible height so the drink stays clear of the toolbar.
    const target = isStandalone() ? Math.max(ih, sh) + 8 : ih;
    el.style.top = "0";
    el.style.left = "0";
    el.style.right = "";
    el.style.bottom = "";
    el.style.height = `${Math.round(target)}px`;
  }
  // expose safe-area insets to the game in design-space pixels so the HUD can dodge the notch/island
  const factor = DESIGN.h / Math.max(1, window.innerHeight);
  G.T.safeTop = cssInset("top") * factor;
  G.T.safeBottom = cssInset("bottom") * factor;
  if (game.scale) game.scale.refresh();
};
game.events.once("ready", fitViewport);
window.addEventListener("resize", fitViewport);
window.addEventListener("load", fitViewport);
window.addEventListener("orientationchange", () => window.setTimeout(fitViewport, 250));
if (window.matchMedia) window.matchMedia("(display-mode: standalone)").addEventListener?.("change", fitViewport);
// iOS settles the viewport after first paint — re-fit a few times.
[80, 250, 600, 1200].forEach((ms) => window.setTimeout(fitViewport, ms));
fitViewport();

// ── Auto-update: a home-screen app resumes a cached page instead of reloading, so a new deploy can go
// unseen. When the app becomes visible, check the live index.html's bundle hash; if it differs from the
// one we're running, reload to pick up the latest. (State is saved, so a reload is safe.)
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
