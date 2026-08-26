import Phaser from "phaser";
import { DESIGN } from "./config";
import { BarScene } from "./BarScene";
import * as G from "./state";
import { initUI } from "./ui";

// Load the save (and grant offline earnings) before the game boots.
G.load();

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

// ── Viewport: fill the screen in both mobile browser and the home-screen app ──
const supportsDvh = typeof CSS !== "undefined" && !!CSS.supports && CSS.supports("height", "100dvh");
const isStandalone = () =>
  (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
  (navigator as unknown as { standalone?: boolean }).standalone === true ||
  // heuristic fallback: a portrait view that already fills the device height is running chrome-less
  (window.innerWidth < window.innerHeight &&
    typeof screen !== "undefined" &&
    window.innerHeight >= (screen.height || 0) * 0.92);

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
    // Size to the real visible viewport. In the browser that's innerHeight (clear of the toolbar); in
    // the home-screen app force at least the full device height so there's never a bottom gap. ENVELOP
    // then covers this exactly (cropping the sides on tall/thin phones), so the art spans the screen.
    let h = window.innerHeight;
    if (isStandalone() && typeof screen !== "undefined" && screen.height) h = Math.max(h, screen.height);
    el.style.top = "0";
    el.style.left = "0";
    el.style.height = `${Math.round(h)}px`;
  }
  // expose safe-area insets to the game in design-space pixels so the HUD can dodge the notch/island
  const factor = DESIGN.h / Math.max(1, window.innerHeight);
  G.T.safeTop = cssInset("top") * factor;
  G.T.safeBottom = cssInset("bottom") * factor;
  if (game.scale) game.scale.refresh();
};
void supportsDvh; // (CSS 100dvh is the pre-JS fallback; JS sizing above is authoritative)
game.events.once("ready", fitViewport);
window.addEventListener("resize", fitViewport);
window.addEventListener("load", fitViewport);
window.addEventListener("orientationchange", () => window.setTimeout(fitViewport, 250));
if (window.matchMedia) window.matchMedia("(display-mode: standalone)").addEventListener?.("change", fitViewport);
// iOS settles the viewport after first paint — re-fit a few times.
[80, 250, 600, 1200].forEach((ms) => window.setTimeout(fitViewport, ms));
fitViewport();
