import Phaser from "phaser";
// Imported (not in public/) so Vite content-hashes them → a changed image gets a NEW filename and can't
// be served stale from the CDN/browser immutable cache.
import bgUrl from "./assets/background.jpg";
import drink1Url from "./assets/drink1.png";
import drink2Url from "./assets/drink2.png";
import drink3Url from "./assets/drink3.png";
import drink4Url from "./assets/drink4.png";

// Idle Bartender — iteration 2. A full shot always waits at the bartender's end. You FLICK it up the bar
// and it glides to rest. When two drinks of the SAME kind touch they combine into the next drink in the
// sequence (shot → second …). Two DIFFERENT drinks can't combine, so they bounce off each other.
//
// Design canvas matches the background art (720x1280, portrait). Scale.ENVELOP fills the whole screen.
const DESIGN_W = 720;
const DESIGN_H = 1280;
const CENTER_X = DESIGN_W * 0.5;

// The drink sequence — each tier's texture. Index 0 is what you flick; touching two of a tier upgrades
// to the next. The last tier can't upgrade further (two of them just bounce).
const TIER_TEX = ["drink1", "drink2", "drink3", "drink4"];
const MAX_TIER = TIER_TEX.length - 1;
const PUCK_CAP = 16; // safety bound on drinks on the table
// Each drink you flick is a random tier: tier 0 is most common and every higher tier is only this
// fraction as likely (exponential falloff) — so you get mostly shots, some seconds, rarer beyond.
const SPAWN_DECAY = 0.2;
// Size multiplier by tier, applied on top of the perspective scale: the first tier is drawn at
// TIER_SCALE_MIN and the last tier at TIER_SCALE_MAX, ramped linearly across MAX_TIER. Recalibrates
// automatically as more tiers are added.
const TIER_SCALE_MIN = 0.5;
const TIER_SCALE_MAX = 1.5;

// The playable wooden table is a perspective trapezoid: wide at the near/bottom edge, narrow at the far
// counter end. Measured from the background art. Shot scale interpolates near→far by height.
const TABLE = {
  nearY: 1140, // bottom (near the bartender) — the launch/rest position
  farY: 334, // top (where the planks meet the counter)
  nearHalf: 355, // half-width at the bottom (planks reach near the screen edges)
  farHalf: 170, // half-width at the counter
  nearScale: 0.36,
  farScale: 0.15,
};

// Flick + glide feel. Launch requires a genuine upward flick; distance scales with how hard you flick.
// Below the threshold the shot resets to the bottom. Flick speed is measured by us in px/sec.
const FLICK = {
  window: 120, // ms of recent motion used to measure the flick speed
  minSpeed: 400, // measured release speed (px/sec) below which it's NOT a flick → reset to origin
  boost: 0.4, // multiplies the measured flick velocity into launch velocity
  maxSpeed: 1250, // hard cap (px/sec)
  friction: 0.98, // per-60fps-frame glide decay — higher glides farther
  settleSpeed: 12, // below this a drink is considered stopped
  launchRange: 260, // you can wind up/aim only this far up from the bottom
  restitution: 0.6, // bounciness when two different drinks collide (0=dead, 1=perfectly elastic)
  radius: 0.42, // collision radius as a fraction of a drink's displayed width
};

interface Puck {
  img: Phaser.GameObjects.Image;
  tier: number;
  vx: number;
  vy: number;
}

interface Sample {
  x: number;
  y: number;
  t: number;
}

class BarScene extends Phaser.Scene {
  private shot!: Phaser.GameObjects.Image; // the current grabbable drink resting at the bottom
  private shotTier = 0; // tier of the current grabbable drink
  private hint?: Phaser.GameObjects.Text;
  private dragging = false;
  private grabDX = 0;
  private grabDY = 0;
  private resetTween?: Phaser.Tweens.Tween;
  private pucks: Puck[] = []; // every launched drink on the table (moving or at rest)
  private samples: Sample[] = []; // recent pointer positions, for measuring the flick

  constructor() {
    super("bar");
  }

  preload() {
    this.load.image("bg", bgUrl);
    this.load.image("drink1", drink1Url);
    this.load.image("drink2", drink2Url);
    this.load.image("drink3", drink3Url);
    this.load.image("drink4", drink4Url);
  }

  create() {
    this.add.image(DESIGN_W / 2, DESIGN_H / 2, "bg").setDisplaySize(DESIGN_W, DESIGN_H).setDepth(0);

    this.hint = this.add
      .text(CENTER_X, DESIGN_H * 0.6, "flick matching drinks together", {
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "32px",
        color: "#fff8e7",
        stroke: "#3a2410",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(10000)
      .setAlpha(0);
    this.tweens.add({ targets: this.hint, alpha: 0.9, duration: 500 });

    this.spawnNextShot();

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  private spawnDrink(tier: number, x: number, y: number) {
    const s = this.add.image(x, y, TIER_TEX[tier]).setOrigin(0.5, 0.82);
    s.setData("tier", tier);
    this.applyPerspective(s);
    return s;
  }

  // Size multiplier for a tier: first tier → TIER_SCALE_MIN, last tier → TIER_SCALE_MAX (linear).
  private tierScale(tier: number) {
    if (MAX_TIER <= 0) return TIER_SCALE_MIN;
    return Phaser.Math.Linear(TIER_SCALE_MIN, TIER_SCALE_MAX, tier / MAX_TIER);
  }

  // Pick a tier with exponential falloff (mostly tier 0), then place the next grabbable drink.
  private randomTier() {
    const weights: number[] = [];
    let w = 1;
    for (let t = 0; t <= MAX_TIER; t++) {
      weights.push(w);
      w *= SPAWN_DECAY;
    }
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let t = 0; t < weights.length; t++) {
      r -= weights[t];
      if (r < 0) return t;
    }
    return 0;
  }

  private spawnNextShot() {
    this.shotTier = this.randomTier();
    this.shot = this.spawnDrink(this.shotTier, CENTER_X, TABLE.nearY);
  }

  private now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  private pushSample(p: Phaser.Input.Pointer) {
    this.samples.push({ x: p.x, y: p.y, t: this.now() });
    if (this.samples.length > 10) this.samples.shift();
  }

  // Velocity (px/sec) of the pointer over the last FLICK.window ms of motion.
  private measureFlick() {
    const s = this.samples;
    if (s.length < 2) return { vx: 0, vy: 0 };
    const last = s[s.length - 1];
    let first = s[s.length - 2];
    for (let i = s.length - 1; i >= 0; i--) {
      if (last.t - s[i].t <= FLICK.window) first = s[i];
      else break;
    }
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0) return { vx: 0, vy: 0 };
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
  }

  private progressAt(y: number) {
    return Phaser.Math.Clamp((TABLE.nearY - y) / (TABLE.nearY - TABLE.farY), 0, 1);
  }

  private applyPerspective(img: Phaser.GameObjects.Image) {
    const t = this.progressAt(img.y);
    const base = Phaser.Math.Linear(TABLE.nearScale, TABLE.farScale, t);
    const tier = (img.getData("tier") as number) || 0;
    img.setScale(base * this.tierScale(tier));
    img.setDepth(img.y); // nearer (larger y) draws in front
  }

  private clampToTable(x: number, y: number) {
    const cy = Phaser.Math.Clamp(y, TABLE.farY, TABLE.nearY);
    const hw = Phaser.Math.Linear(TABLE.nearHalf, TABLE.farHalf, this.progressAt(cy));
    const cx = Phaser.Math.Clamp(x, CENTER_X - hw, CENTER_X + hw);
    return { x: cx, y: cy };
  }

  private radius(p: Puck) {
    return p.img.displayWidth * FLICK.radius;
  }

  private onDown(p: Phaser.Input.Pointer) {
    const grabR = Math.max(this.shot.displayWidth, this.shot.displayHeight) * 0.75 + 60;
    if (Phaser.Math.Distance.Between(p.x, p.y, this.shot.x, this.shot.y) > grabR) return;
    this.resetTween?.stop();
    this.resetTween = undefined;
    this.dragging = true;
    this.grabDX = this.shot.x - p.x;
    this.grabDY = this.shot.y - p.y;
    this.samples = [];
    this.pushSample(p);
    if (this.hint) {
      this.tweens.add({ targets: this.hint, alpha: 0, duration: 200, onComplete: () => this.hint?.destroy() });
      this.hint = undefined;
    }
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!this.dragging) return;
    this.pushSample(p);
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
    this.pushSample(p);

    const { vx, vy } = this.measureFlick();
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
    this.pucks.push({ img: this.shot, tier: this.shotTier, vx: lvx, vy: lvy });
    // A new (randomly-tiered) drink is immediately ready at the bottom.
    this.spawnNextShot();
  }

  // Snap the shot back to the bottom launch spot (used when the release wasn't a flick).
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
    const step = dt / 1000;
    const friction = Math.pow(FLICK.friction, dt / 16.67);

    // Move each drink, glide with friction, clamp to the table.
    for (const p of this.pucks) {
      if (Math.hypot(p.vx, p.vy) >= FLICK.settleSpeed) {
        const nx = p.img.x + p.vx * step;
        const ny = p.img.y + p.vy * step;
        const c = this.clampToTable(nx, ny);
        if (c.x !== nx) p.vx = 0; // hit a side rail
        if (c.y !== ny) p.vy = 0; // reached the far counter
        p.img.x = c.x;
        p.img.y = c.y;
        p.vx *= friction;
        p.vy *= friction;
      } else {
        p.vx = 0;
        p.vy = 0;
      }
      this.applyPerspective(p.img);
    }

    this.resolveCollisions();

    while (this.pucks.length > PUCK_CAP) this.pucks.shift()?.img.destroy();
  }

  private resolveCollisions() {
    const n = this.pucks.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = this.pucks[i];
        const b = this.pucks[j];
        const dx = b.img.x - a.img.x;
        const dy = b.img.y - a.img.y;
        let dist = Math.hypot(dx, dy);
        if (dist === 0) dist = 0.001;
        const rr = this.radius(a) + this.radius(b);
        if (dist >= rr) continue;

        if (a.tier === b.tier && a.tier < MAX_TIER) {
          this.merge(i, j); // same kind → combine; array changes, bail and finish next frame
          return;
        }
        this.bounce(a, b, dx, dy, dist, rr); // different kinds (or top tier) → bounce apart
      }
    }
  }

  private bounce(a: Puck, b: Puck, dx: number, dy: number, dist: number, rr: number) {
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = rr - dist;
    // separate the two so they don't stay stuck inside each other
    let ca = this.clampToTable(a.img.x - (nx * overlap) / 2, a.img.y - (ny * overlap) / 2);
    let cb = this.clampToTable(b.img.x + (nx * overlap) / 2, b.img.y + (ny * overlap) / 2);
    a.img.x = ca.x;
    a.img.y = ca.y;
    b.img.x = cb.x;
    b.img.y = cb.y;
    // exchange the velocity component along the collision normal (equal-mass elastic + restitution)
    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vn < 0) {
      const imp = (-(1 + FLICK.restitution) * vn) / 2;
      a.vx -= imp * nx;
      a.vy -= imp * ny;
      b.vx += imp * nx;
      b.vy += imp * ny;
    }
    this.applyPerspective(a.img);
    this.applyPerspective(b.img);
  }

  private merge(i: number, j: number) {
    const a = this.pucks[i];
    const b = this.pucks[j];
    const mx = (a.img.x + b.img.x) / 2;
    const my = (a.img.y + b.img.y) / 2;
    const tier = a.tier + 1;
    const vx = (a.vx + b.vx) * 0.2;
    const vy = (a.vy + b.vy) * 0.2;
    a.img.destroy();
    b.img.destroy();
    this.pucks.splice(j, 1); // remove higher index first
    this.pucks.splice(i, 1);
    const img = this.spawnDrink(tier, mx, my);
    this.pucks.push({ img, tier, vx, vy });
    // quick flash so the combine reads (alpha isn't touched by the perspective update)
    img.setAlpha(0.3);
    this.tweens.add({ targets: img, alpha: 1, duration: 220, ease: "Quad.out" });
  }
}

const game = new Phaser.Game({
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

// Mobile browsers (esp. iOS Safari) report 100vh as the *large* viewport that extends behind the
// toolbars, so the bottom of the canvas — and the drink resting there — was pushed out of view. Pin the
// container to the actual visible height and re-fit Phaser whenever it changes (toolbar show/hide, rotate).
const fitViewport = () => {
  const el = document.getElementById("game");
  if (el) el.style.height = `${window.innerHeight}px`;
  if (game.scale) game.scale.refresh();
};
game.events.once("ready", fitViewport);
window.addEventListener("resize", fitViewport);
window.addEventListener("orientationchange", () => window.setTimeout(fitViewport, 150));
fitViewport();
