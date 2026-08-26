import Phaser from "phaser";
// Imported (not in public/) so Vite content-hashes them → a changed image gets a NEW filename and can't
// be served stale from the CDN/browser immutable cache.
import bgUrl from "./assets/background.jpg";
import shotUrl from "./assets/shot.png";

// Idle Bartender — iteration 1. A shot rests at the bartender's end; you aim + flick it from a launch
// zone near the bottom, then let go — it LAUNCHES up the bar and glides to a stop at the far/counter
// end. You only steer it at the bottom; once released, physics carries it. The shot persists.
//
// Design canvas matches the background art (720x1280, portrait). Scale.ENVELOP fills the whole screen.
const DESIGN_W = 720;
const DESIGN_H = 1280;
const CENTER_X = DESIGN_W * 0.5;

// The playable wooden table is a perspective trapezoid: wide at the near/bottom edge, narrow at the far
// counter end. Shot scale interpolates near→far by height.
const TABLE = {
  nearY: 1185, // bottom (near the bartender)
  farY: 430, // top (at the counter)
  nearHalf: 330, // half-width at the bottom
  farHalf: 150, // half-width at the counter
  nearScale: 0.36,
  farScale: 0.15,
};

// Release behaviour. On let-go the shot launches UP the bar with a strong, reliable speed (so even a
// slow drag-and-release sends it), glides with low friction, and settles at the far end (clamped).
const SLIDE = {
  launchSpeed: 2600, // base upward launch speed (px/sec) — guarantees a fast slide toward the end
  flickBoost: 1.4, // a hard flick adds extra power + lateral aim on top of the base launch
  maxSpeed: 5200, // hard cap (px/sec)
  friction: 0.985, // per-60fps-frame decay — higher glides further; lower stops sooner
  minSpeed: 8, // below this it's considered stopped
  launchRange: 240, // you can aim/wind up only this far up from the near edge
};

class BarScene extends Phaser.Scene {
  private shot!: Phaser.GameObjects.Image;
  private hint?: Phaser.GameObjects.Text;
  private dragging = false;
  private grabDX = 0;
  private grabDY = 0;
  private vx = 0;
  private vy = 0;

  constructor() {
    super("bar");
  }

  preload() {
    this.load.image("bg", bgUrl);
    this.load.image("shot", shotUrl);
  }

  create() {
    this.add.image(DESIGN_W / 2, DESIGN_H / 2, "bg").setDisplaySize(DESIGN_W, DESIGN_H).setDepth(0);

    this.hint = this.add
      .text(CENTER_X, DESIGN_H * 0.6, "flick the shot up the bar", {
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "34px",
        color: "#fff8e7",
        stroke: "#3a2410",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(10000)
      .setAlpha(0);
    this.tweens.add({ targets: this.hint, alpha: 0.9, duration: 500 });

    this.shot = this.add.image(CENTER_X, TABLE.nearY, "shot").setOrigin(0.5, 0.82);
    this.applyPerspective();

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  private progressAt(y: number) {
    return Phaser.Math.Clamp((TABLE.nearY - y) / (TABLE.nearY - TABLE.farY), 0, 1);
  }

  private applyPerspective() {
    const t = this.progressAt(this.shot.y);
    this.shot.setScale(Phaser.Math.Linear(TABLE.nearScale, TABLE.farScale, t));
    this.shot.setDepth(this.shot.y);
  }

  private clampToTable(x: number, y: number) {
    const cy = Phaser.Math.Clamp(y, TABLE.farY, TABLE.nearY);
    const hw = Phaser.Math.Linear(TABLE.nearHalf, TABLE.farHalf, this.progressAt(cy));
    const cx = Phaser.Math.Clamp(x, CENTER_X - hw, CENTER_X + hw);
    return { x: cx, y: cy };
  }

  private onDown(p: Phaser.Input.Pointer) {
    const grabR = Math.max(this.shot.displayWidth, this.shot.displayHeight) * 0.75 + 60;
    if (Phaser.Math.Distance.Between(p.x, p.y, this.shot.x, this.shot.y) > grabR) return;
    this.dragging = true;
    this.vx = 0;
    this.vy = 0;
    this.grabDX = this.shot.x - p.x;
    this.grabDY = this.shot.y - p.y;
    if (this.hint) {
      this.tweens.add({ targets: this.hint, alpha: 0, duration: 200, onComplete: () => this.hint?.destroy() });
      this.hint = undefined;
    }
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!this.dragging) return;
    // aim + wind up only in the bottom launch zone — you can't steer it up the table.
    const ty = Phaser.Math.Clamp(p.y + this.grabDY, TABLE.nearY - SLIDE.launchRange, TABLE.nearY);
    const { x, y } = this.clampToTable(p.x + this.grabDX, ty);
    this.shot.x = x;
    this.shot.y = y;
    this.applyPerspective();
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (!this.dragging) return;
    this.dragging = false;
    // Always launch strongly up the bar; a hard upward flick makes it faster; the flick's x adds aim.
    let vx = p.velocity.x * SLIDE.flickBoost;
    let vy = Math.min(-SLIDE.launchSpeed, p.velocity.y * SLIDE.flickBoost);
    const speed = Math.hypot(vx, vy);
    if (speed > SLIDE.maxSpeed) {
      const k = SLIDE.maxSpeed / speed;
      vx *= k;
      vy *= k;
    }
    this.vx = vx;
    this.vy = vy;
  }

  // Glide with friction, clamped to the table — settles at the far/counter end, then rests. Never removed.
  update(_t: number, dt: number) {
    if (this.dragging || Math.hypot(this.vx, this.vy) < SLIDE.minSpeed) {
      this.vx = 0;
      this.vy = 0;
      return;
    }
    const step = dt / 1000;
    const nx = this.shot.x + this.vx * step;
    const ny = this.shot.y + this.vy * step;
    const c = this.clampToTable(nx, ny);
    if (c.x !== nx) this.vx = 0;
    if (c.y !== ny) this.vy = 0;
    this.shot.x = c.x;
    this.shot.y = c.y;
    this.applyPerspective();
    const friction = Math.pow(SLIDE.friction, dt / 16.67);
    this.vx *= friction;
    this.vy *= friction;
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b1e3f",
  scale: {
    mode: Phaser.Scale.ENVELOP,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN_W,
    height: DESIGN_H,
  },
  scene: [BarScene],
});
