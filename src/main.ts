import Phaser from "phaser";
import { DESIGN } from "./config";
import { BarScene } from "./BarScene";
import * as G from "./state";
import { initUI } from "./ui";
import bgUrl from "./assets/background.jpg";

// Load the save (and grant offline earnings) before the game boots.
G.load();

// Paint the bar art behind the (transparent) canvas. Crucially on the #game CONTAINER — a fixed element
// that reaches into the iOS safe area (diagnostic showed its box extends past the screen bottom), so its
// background IMAGE paints that strip. Root/body only paint the safe area with a COLOR (the iOS quirk that
// was leaving the flat-orange bar), so #game is the one that actually fills it with the table image.
// Fallback color (matches the bar art's bottom) behind everything.
const pageBg = "#c76914";
document.documentElement.style.background = pageBg;
document.body.style.background = pageBg;
const gameEl = document.getElementById("game");
if (gameEl) gameEl.style.background = pageBg;
// Real <img> backdrop (beach). An image ELEMENT paints pixels into the iOS home-indicator safe area
// (a CSS background only fills it with a color). It's sized in fitViewport() to the true device height
// so it reaches the physical bottom — CSS height:100% came up short of the screen (that was the bar).
const bgImgEl = document.getElementById("bgimg") as HTMLImageElement | null;
if (bgImgEl) bgImgEl.src = bgUrl;

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

const DESIGN_ASPECT = DESIGN.w / DESIGN.h; // 0.5625 (portrait)

const fitViewport = () => {
  const ih = window.innerHeight;
  const sh = (typeof screen !== "undefined" && screen.height) || ih;
  // Size to the true device height so both the canvas and the <img> backdrop reach the physical bottom
  // (innerHeight is short by the safe areas — that shortfall was the home-indicator bar).
  const target = isStandalone() ? Math.max(ih, sh) + 8 : ih;
  for (const id of ["game", "bgimg"]) {
    const e = document.getElementById(id);
    if (!e) continue;
    e.style.top = "0";
    e.style.left = "0";
    e.style.right = "";
    e.style.bottom = "";
    e.style.width = "100vw";
    e.style.height = `${Math.round(target)}px`;
  }
  // Scale by HEIGHT always. When the screen is TALLER/narrower than the portrait design (a phone),
  // ENVELOP fills the height and crops the sides → no bars. When the screen is WIDER than the design
  // (landscape/desktop), FIT fits by height and pillarboxes the sides → bars on the sides only, the full
  // portrait shot shown (instead of ENVELOP zooming all the way in on width).
  if (game.scale) {
    const screenAspect = window.innerWidth / Math.max(1, window.innerHeight);
    game.scale.scaleMode = screenAspect > DESIGN_ASPECT ? Phaser.Scale.FIT : Phaser.Scale.ENVELOP;
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
