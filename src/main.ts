import Phaser from "phaser";
// Imported (not in public/) so Vite content-hashes them → a changed image gets a NEW filename and can't
// be served stale from the CDN/browser immutable cache.
import bgUrl from "./assets/background.jpg";
import shotUrl from "./assets/shot.png";

// Idle Bartender — iteration 1. A full shot always waits at the bartender's end. You grab it and must
// FLICK it up the bar: a real flick launches it and it glides to rest up the counter (and stays there);
// a weak/slow release just resets it back to the bottom. A fresh shot appears at the bottom after each
// flick, so there's always one ready.
//
// Design canvas matches the background art (720x1280, portrait). Scale.ENVELOP fills the whole screen.
const DESIGN_W = 720;
const DESIGN_H = 1280;
const CENTER_X = DESIGN_W * 0.5;

// The playable wooden table is a perspective trapezoid: wide at the near/bottom edge, narrow at the far
// counter end. Shot scale interpolates near→far by height.
const TABLE = {
  nearY: 1185, // bottom (near the bartender) — the launch/rest position
  farY: 430, // top (at the counter)
  nearHalf: 330, // half-width at the bottom
  farHalf: 150, // half-width at the counter
  nearScale: 0.36,
  farScale: 0.15,
};

// Flick + glide feel. Launch requires a genuine upward flick; distance scales with how hard you flick
// (skill). Below the threshold the shot resets to the bottom instead of launching.
const FLICK = {
  minSpeed: 320, // release speed (px/sec) below which it's NOT a flick → reset to origin
  boost: 2.2, // multiplies the flick velocity into launch velocity
  maxSpeed: 5000, // hard cap (px/sec)
  friction: 0.98, // per-60fps-frame glide decay — higher glides farther
  settleSpeed: 12, // below this an in-flight shot is considered stopped
  launchRange: 260, // you can wind up/aim only this far up from the bottom
  restCap: 14, // keep at most this many settled drinks on the bar (memory bound)
};

interface Flying {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
}

class BarScene extends Phaser.Scene {
  private shot!: Phaser.GameObjects.Image; // the current grabbable shot resting at the bottom
  private hint?: Phaser.GameObjects.Text;
  private dragging = false;
  private grabDX = 0;
  private grabDY = 0;
  private resetTween?: Phaser.Tweens.Tween;
  private flying: Flying[] = []; // shots currently gliding up the bar
  private rested: Phaser.GameObjects.Image[] = []; // shots that have come to rest (persist)

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

    this.shot = this.spawnShot();

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  // A fresh shot always waits at the bottom launch spot.
  private spawnShot() {
    const s = this.add.image(CENTER_X, TABLE.nearY, "shot").setOrigin(0.5, 0.82);
    this.applyPerspective(s);
    return s;
  }

  private progressAt(y: number) {
    return Phaser.Math.Clamp((TABLE.nearY - y) / (TABLE.nearY - TABLE.farY), 0, 1);
  }

  private applyPerspective(img: Phaser.GameObjects.Image) {
    const t = this.progressAt(img.y);
    img.setScale(Phaser.Math.Linear(TABLE.nearScale, TABLE.farScale, t));
    img.setDepth(img.y); // nearer (larger y) draws in front
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
    this.resetTween?.stop();
    this.resetTween = undefined;
    this.dragging = true;
    this.grabDX = this.shot.x - p.x;
    this.grabDY = this.shot.y - p.y;
    if (this.hint) {
      this.tweens.add({ targets: this.hint, alpha: 0, duration: 200, onComplete: () => this.hint?.destroy() });
      this.hint = undefined;
    }
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!this.dragging) return;
    // wind up/aim only in the bottom launch zone.
    const ty = Phaser.Math.Clamp(p.y + this.grabDY, TABLE.nearY - FLICK.launchRange, TABLE.nearY);
    const { x, y } = this.clampToTable(p.x + this.grabDX, ty);
    this.shot.x = x;
    this.shot.y = y;
    this.applyPerspective(this.shot);
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (!this.dragging) return;
    this.dragging = false;

    const vx = p.velocity.x;
    const vy = p.velocity.y;
    const speed = Math.hypot(vx, vy);
    const isFlick = vy < 0 && speed >= FLICK.minSpeed; // must be an upward flick, fast enough

    if (!isFlick) {
      this.resetShot(); // not a real flick → send it back to the bottom
      return;
    }

    // Launch: velocity scales with flick strength (aim + power are the skill), capped.
    let lvx = vx * FLICK.boost;
    let lvy = vy * FLICK.boost;
    const ls = Math.hypot(lvx, lvy);
    if (ls > FLICK.maxSpeed) {
      const k = FLICK.maxSpeed / ls;
      lvx *= k;
      lvy *= k;
    }
    this.flying.push({ img: this.shot, vx: lvx, vy: lvy });
    // A new shot is immediately ready at the bottom.
    this.shot = this.spawnShot();
  }

  // Glide the launched shot back to the bottom launch spot (used when the release wasn't a flick).
  private resetShot() {
    this.resetTween = this.tweens.add({
      targets: this.shot,
      x: CENTER_X,
      y: TABLE.nearY,
      duration: 220,
      ease: "Back.out",
      onUpdate: () => this.applyPerspective(this.shot),
      onComplete: () => {
        this.applyPerspective(this.shot);
        this.resetTween = undefined;
      },
    });
  }

  update(_t: number, dt: number) {
    if (this.flying.length === 0) return;
    const step = dt / 1000;
    const friction = Math.pow(FLICK.friction, dt / 16.67);

    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      const nx = f.img.x + f.vx * step;
      const ny = f.img.y + f.vy * step;
      const c = this.clampToTable(nx, ny);
      if (c.x !== nx) f.vx = 0; // hit a side rail
      if (c.y !== ny) f.vy = 0; // reached the far counter
      f.img.x = c.x;
      f.img.y = c.y;
      this.applyPerspective(f.img);
      f.vx *= friction;
      f.vy *= friction;

      if (Math.hypot(f.vx, f.vy) < FLICK.settleSpeed) {
        // Settled — it stays on the bar as a resting drink.
        this.rested.push(f.img);
        this.flying.splice(i, 1);
        if (this.rested.length > FLICK.restCap) {
          this.rested.shift()?.destroy();
        }
      }
    }
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
