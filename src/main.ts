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

// ── TEMP DIAGNOSTIC: report the real iOS webview geometry + which display-mode/safe-areas iOS chose ──
{
  const probe = (h: string) => {
    const d = document.createElement("div");
    d.style.cssText = `position:fixed;top:0;left:0;width:1px;height:${h};visibility:hidden;`;
    document.body.appendChild(d);
    const v = Math.round(d.getBoundingClientRect().height);
    d.remove();
    return v;
  };
  const mm = (q: string) => window.matchMedia(q).matches;
  const nav = navigator as unknown as { standalone?: boolean };
  // CYAN band inside the reserved strip; RED at the true bottom:0 anchor.
  const cyan = document.createElement("div");
  cyan.style.cssText = `position:fixed;left:0;right:0;top:${screen.height - 45}px;height:45px;background:#00ffff;z-index:99999;pointer-events:none;`;
  document.body.appendChild(cyan);
  const red = document.createElement("div");
  red.style.cssText = "position:fixed;left:0;right:0;bottom:0;height:8px;background:#ff0000;z-index:99999;pointer-events:none;";
  document.body.appendChild(red);
  const dbg = document.createElement("div");
  dbg.style.cssText =
    "position:fixed;top:0;left:0;z-index:99999;font:11px/1.35 monospace;color:#000;background:rgba(255,255,255,0.92);padding:5px 7px;white-space:pre;border-radius:0 0 8px 0;pointer-events:none;";
  const vv = window.visualViewport;
  const redraw = () =>
    (dbg.textContent =
      `inner=${window.innerHeight} screen=${screen.height} vv=${vv ? Math.round(vv.height) : "-"}\n` +
      `vh=${probe("100vh")} dvh=${probe("100dvh")} lvh=${probe("100lvh")}\n` +
      `sat=${probe("env(safe-area-inset-top)")} sab=${probe("env(safe-area-inset-bottom)")}\n` +
      `scrollH=${document.documentElement.scrollHeight} canvasH=${Math.round((document.querySelector("#game canvas") as HTMLCanvasElement)?.getBoundingClientRect().height || 0)}\n` +
      `navStandalone=${nav.standalone} fs=${mm("(display-mode:fullscreen)")} sa=${mm("(display-mode:standalone)")} br=${mm("(display-mode:browser)")}`);
  redraw();
  window.addEventListener("resize", redraw);
  window.setTimeout(redraw, 600);
  document.body.appendChild(dbg);
}
