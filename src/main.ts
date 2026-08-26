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
  (navigator as unknown as { standalone?: boolean }).standalone === true;
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
  if (game.scale) game.scale.refresh();
};
game.events.once("ready", fitViewport);
window.addEventListener("resize", fitViewport);
window.addEventListener("orientationchange", () => window.setTimeout(fitViewport, 200));
if (window.matchMedia) window.matchMedia("(display-mode: standalone)").addEventListener?.("change", fitViewport);
fitViewport();
