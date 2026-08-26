import Phaser from "phaser";
import { DESIGN } from "./config";
import { BarScene } from "./BarScene";
import { UIScene } from "./UIScene";
import * as G from "./state";

// Load the save (and grant offline earnings) before the game boots.
G.load();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b1e3f",
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
  scene: [BarScene, UIScene],
});

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
    if (isStandalone()) {
      // Home-screen app: 100dvh can report short of the real screen on iOS (a bottom bar). Pin all edges.
      el.style.height = "auto";
      el.style.top = "0";
      el.style.right = "0";
      el.style.bottom = "0";
      el.style.left = "0";
    } else if (supportsDvh) {
      el.style.removeProperty("height"); // CSS 100dvh tracks the visible (toolbar-aware) viewport
    } else {
      el.style.height = `${window.innerHeight}px`;
    }
  }
  // expose safe-area insets to the game in design-space pixels so the HUD can dodge the notch/island
  const factor = DESIGN.h / Math.max(1, window.innerHeight);
  G.T.safeTop = cssInset("top") * factor;
  G.T.safeBottom = cssInset("bottom") * factor;
  if (game.scale) game.scale.refresh();
};
game.events.once("ready", fitViewport);
window.addEventListener("resize", fitViewport);
window.addEventListener("orientationchange", () => window.setTimeout(fitViewport, 200));
if (window.matchMedia) window.matchMedia("(display-mode: standalone)").addEventListener?.("change", fitViewport);
fitViewport();
