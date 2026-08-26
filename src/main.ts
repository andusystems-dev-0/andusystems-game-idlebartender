import Phaser from "phaser";
import { DESIGN } from "./config";
import { BarScene } from "./BarScene";
import * as G from "./state";
import { initUI } from "./ui";
import bgUrl from "./assets/background.jpg";

// Load the save (and grant offline earnings) before the game boots.
G.load();

// Paint the beach behind the canvas too, so any sliver the canvas doesn't cover shows the bar
// continuing (never a black/blank bar).
document.body.style.background = `#c76914 url(${bgUrl}) center / cover no-repeat`;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  // matches the bar art's bottom edge so any sliver the canvas misses blends in
  backgroundColor: "#c76914",
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

const fitViewport = () => {
  const el = document.getElementById("game");
  if (el) {
    // OVER-COVER: make the container a bit TALLER than the visible viewport so ENVELOP (cover) always
    // reaches the physical bottom — this defeats the iOS home-indicator gap and any short viewport
    // report, detection-free. The extra height is just empty deck below the drink, cropped off-screen;
    // the play area still fits vertically. Top-anchored so the drink/table stay put; width is cropped.
    const pad = Math.max(56, cssInset("bottom") + 20);
    el.style.top = "0";
    el.style.left = "0";
    el.style.right = "";
    el.style.bottom = "";
    el.style.height = `${Math.round(window.innerHeight + pad)}px`;
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
