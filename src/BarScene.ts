import Phaser from "phaser";
import bgUrl from "./assets/background.jpg";
import drink1Url from "./assets/drink1.png";
import drink2Url from "./assets/drink2.png";
import drink3Url from "./assets/drink3.png";
import drink4Url from "./assets/drink4.png";
import {
  SS, DESIGN, CENTER_X, TABLE, FLICK, TIER_SCALE_MIN, TIER_SCALE_MAX, MAX_TIER, REAL_ART_TIERS,
  TIER_TEX, tierColor, DRINK_NAMES,
} from "./config";
import * as G from "./state";
import { fmt } from "./format";

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

export class BarScene extends Phaser.Scene {
  private shot!: Phaser.GameObjects.Image;
  private shotTier = 0;
  private label?: Phaser.GameObjects.Text; // name of the drink currently in hand
  private hint?: Phaser.GameObjects.Text;
  private dragging = false;
  private grabDX = 0;
  private grabDY = 0;
  private resetTween?: Phaser.Tweens.Tween;
  private pucks: Puck[] = [];
  private samples: Sample[] = [];
  private autobarTimer = 0;
  private serverTimer = 0;
  private saveTimer = 0;

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
    // placeholder art for every tier beyond the real drawings
    for (let t = REAL_ART_TIERS; t <= MAX_TIER; t++) this.makePlaceholder(TIER_TEX[t], t);
    this.makeSpark();
    for (let t = 0; t < REAL_ART_TIERS; t++) {
      this.textures.get(TIER_TEX[t]).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    this.textures.get("bg").setFilter(Phaser.Textures.FilterMode.LINEAR);

    this.add.image(DESIGN.w / 2, DESIGN.h / 2, "bg").setDisplaySize(DESIGN.w, DESIGN.h).setDepth(0);

    this.hint = this.add
      .text(CENTER_X, DESIGN.h * 0.58, "flick matching drinks together", {
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: `${34 * SS}px`,
        color: "#fff8e7",
        stroke: "#3a2410",
        strokeThickness: 6 * SS,
      })
      .setOrigin(0.5)
      .setDepth(10000)
      .setAlpha(0);
    this.tweens.add({ targets: this.hint, alpha: 0.9, duration: 500 });

    this.label = this.add
      .text(CENTER_X, TABLE.nearY + 60 * SS, "", {
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: `${26 * SS}px`,
        color: "#fff8e7",
        stroke: "#3a2410",
        strokeThickness: 4 * SS,
      })
      .setOrigin(0.5)
      .setDepth(10000);

    this.spawnNextShot();

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.onUp(p));

    // clear the table when the run resets
    const onPrestige = () => this.clearTable();
    G.bus.on("prestige", onPrestige);
    // when a menu closes, drop any stray drag so the next flick starts clean
    const onUiClosed = () => {
      this.dragging = false;
      this.samples = [];
    };
    G.bus.on("uiClosed", onUiClosed);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      G.bus.off("prestige", onPrestige);
      G.bus.off("uiClosed", onUiClosed);
    });
  }

  // ── placeholder + particle textures ────────────────────────────────────────
  private makePlaceholder(key: string, tier: number) {
    if (this.textures.exists(key)) return;
    const w = 220;
    const h = 320;
    const g = this.add.graphics();
    const col = tierColor(tier);
    // stem + foot
    g.fillStyle(0xffffff, 0.22);
    g.fillRect(w * 0.46, h * 0.6, w * 0.08, h * 0.28);
    g.fillEllipse(w * 0.5, h * 0.92, w * 0.5, h * 0.09);
    // glass bowl
    g.fillStyle(0xffffff, 0.18);
    g.beginPath();
    g.moveTo(w * 0.18, h * 0.1);
    g.lineTo(w * 0.82, h * 0.1);
    g.lineTo(w * 0.6, h * 0.64);
    g.lineTo(w * 0.4, h * 0.64);
    g.closePath();
    g.fillPath();
    // liquid
    g.fillStyle(col, 0.95);
    g.beginPath();
    g.moveTo(w * 0.25, h * 0.22);
    g.lineTo(w * 0.75, h * 0.22);
    g.lineTo(w * 0.58, h * 0.62);
    g.lineTo(w * 0.42, h * 0.62);
    g.closePath();
    g.fillPath();
    // rim highlight
    g.lineStyle(6, 0xffffff, 0.85);
    g.beginPath();
    g.moveTo(w * 0.18, h * 0.1);
    g.lineTo(w * 0.82, h * 0.1);
    g.strokePath();
    g.generateTexture(key, w, h);
    g.destroy();
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  private makeSpark() {
    if (this.textures.exists("spark")) return;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(16, 16, 16);
    g.generateTexture("spark", 32, 32);
    g.destroy();
  }

  // ── drinks ─────────────────────────────────────────────────────────────────
  private spawnDrink(tier: number, x: number, y: number) {
    const shadow = this.add.ellipse(x, y, 100, 100, 0x000000, 0.16).setDepth(y - 1);
    const s = this.add.image(x, y, TIER_TEX[tier]).setOrigin(0.5, 0.82);
    s.setData("tier", tier);
    s.setData("shadow", shadow);
    s.setData("pop", 1);
    this.applyPerspective(s);
    return s;
  }

  private destroyDrink(img: Phaser.GameObjects.Image) {
    (img.getData("shadow") as Phaser.GameObjects.GameObject | undefined)?.destroy();
    img.destroy();
  }

  private clearTable() {
    for (const p of this.pucks) this.destroyDrink(p.img);
    this.pucks = [];
  }

  private tierScale(tier: number) {
    if (MAX_TIER <= 0) return TIER_SCALE_MIN;
    return Phaser.Math.Linear(TIER_SCALE_MIN, TIER_SCALE_MAX, tier / MAX_TIER);
  }

  private spawnNextShot() {
    this.shotTier = G.rollSpawnTier();
    this.shot = this.spawnDrink(this.shotTier, CENTER_X, TABLE.nearY);
    if (this.label) this.label.setText(DRINK_NAMES[this.shotTier]).setY(TABLE.nearY + 70 * SS);
  }

  private now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  private pushSample(p: Phaser.Input.Pointer) {
    this.samples.push({ x: p.x, y: p.y, t: this.now() });
    if (this.samples.length > 10) this.samples.shift();
  }

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
    const pop = (img.getData("pop") as number) || 1;
    img.setScale(base * this.tierScale(tier) * pop);
    img.setDepth(img.y);
    const shadow = img.getData("shadow") as Phaser.GameObjects.Ellipse | undefined;
    if (shadow) {
      shadow.setPosition(img.x, img.y + img.displayHeight * 0.15);
      shadow.setScale((img.displayWidth * 0.72) / 100, (img.displayWidth * 0.2) / 100);
      shadow.setDepth(img.y - 1);
    }
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

  // ── input ────────────────────────────────────────────────────────────────
  private onDown(p: Phaser.Input.Pointer) {
    if (G.T.modalOpen) return; // a shop/prestige panel is up
    const grabR = Math.max(this.shot.displayWidth, this.shot.displayHeight) * 0.75 + 60 * SS;
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
    const ty = Phaser.Math.Clamp(p.y + this.grabDY, TABLE.nearY - FLICK.launchRange, TABLE.nearY);
    const { x, y } = this.clampToTable(p.x + this.grabDX, ty);
    this.shot.x = x;
    this.shot.y = y;
    this.applyPerspective(this.shot);
    if (this.label) this.label.setAlpha(0);
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (!this.dragging) return;
    this.dragging = false;
    this.pushSample(p);
    const { vx, vy } = this.measureFlick();
    const speed = Math.hypot(vx, vy);
    if (!(vy < 0 && speed >= FLICK.minSpeed)) {
      this.resetShot();
      return;
    }
    let lvx = vx * FLICK.boost;
    let lvy = vy * FLICK.boost;
    const ls = Math.hypot(lvx, lvy);
    if (ls > FLICK.maxSpeed) {
      const k = FLICK.maxSpeed / ls;
      lvx *= k;
      lvy *= k;
    }
    this.launch(lvx, lvy);
  }

  private launch(vx: number, vy: number) {
    this.pucks.push({ img: this.shot, tier: this.shotTier, vx, vy });
    this.spawnNextShot();
    if (this.label) this.label.setAlpha(1);
  }

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
        if (this.label) this.label.setAlpha(1);
      },
    });
  }

  // ── auto (idle) systems ────────────────────────────────────────────────────
  private autoFlick() {
    if (this.dragging || G.T.modalOpen) return;
    if (this.pucks.length >= G.capacity() - 1) return;
    const vy = -Phaser.Math.FloatBetween(0.55, 1.0) * FLICK.maxSpeed;
    const vx = Phaser.Math.FloatBetween(-0.3, 0.3) * FLICK.maxSpeed;
    this.launch(vx, vy);
  }

  private autoServe() {
    // serve the highest-tier resting drink (tier >= 1) for coins
    let best = -1;
    let bestTier = 0;
    for (let i = 0; i < this.pucks.length; i++) {
      const p = this.pucks[i];
      if (p.tier >= 1 && Math.hypot(p.vx, p.vy) < FLICK.settleSpeed && p.tier > bestTier) {
        bestTier = p.tier;
        best = i;
      }
    }
    if (best < 0) return;
    const p = this.pucks[best];
    const coins = G.serveDrink(p.tier);
    this.floatText(p.img.x, p.img.y, `+${fmt(coins)}`, "#bfe9ff");
    this.burst(p.img.x, p.img.y, tierColor(p.tier), 10);
    this.destroyDrink(p.img);
    this.pucks.splice(best, 1);
  }

  private enforceCapacity() {
    const cap = G.capacity();
    while (this.pucks.length > cap) {
      // serve the lowest-tier drink to make room (rewards, doesn't just delete)
      let idx = 0;
      for (let i = 1; i < this.pucks.length; i++) if (this.pucks[i].tier < this.pucks[idx].tier) idx = i;
      const p = this.pucks[idx];
      if (p.tier >= 1) {
        const coins = G.serveDrink(p.tier);
        this.floatText(p.img.x, p.img.y, `+${fmt(coins)}`, "#bfe9ff");
      }
      this.destroyDrink(p.img);
      this.pucks.splice(idx, 1);
    }
  }

  // ── main loop ───────────────────────────────────────────────────────────────
  update(_t: number, dt: number) {
    const step = dt / 1000;
    const friction = Math.pow(FLICK.friction, dt / 16.67);

    for (const p of this.pucks) {
      if (Math.hypot(p.vx, p.vy) >= FLICK.settleSpeed) {
        const nx = p.img.x + p.vx * step;
        const ny = p.img.y + p.vy * step;
        const c = this.clampToTable(nx, ny);
        if (c.x !== nx) p.vx = 0;
        if (c.y !== ny) p.vy = 0;
        p.img.x = c.x;
        p.img.y = c.y;
        p.vx *= friction;
        p.vy *= friction;
      } else {
        p.vx = 0;
        p.vy = 0;
      }
      // pop decay (merge feedback)
      const pop = (p.img.getData("pop") as number) || 1;
      if (pop !== 1) p.img.setData("pop", pop + (1 - pop) * 0.18);
      this.applyPerspective(p.img);
    }

    this.resolveCollisions();
    this.enforceCapacity();

    // auto systems
    if (G.autobarEnabled()) {
      this.autobarTimer += dt;
      if (this.autobarTimer >= G.autobarInterval()) {
        this.autobarTimer = 0;
        this.autoFlick();
      }
    }
    if (G.serverEnabled()) {
      this.serverTimer += dt;
      if (this.serverTimer >= G.serverInterval()) {
        this.serverTimer = 0;
        this.autoServe();
      }
    }

    this.saveTimer += dt;
    if (this.saveTimer >= 8000) {
      this.saveTimer = 0;
      G.save();
    }
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
          this.merge(i, j);
          return;
        }
        this.bounce(a, b, dx, dy, dist, rr);
      }
    }
  }

  private bounce(a: Puck, b: Puck, dx: number, dy: number, dist: number, rr: number) {
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = rr - dist;
    const ca = this.clampToTable(a.img.x - (nx * overlap) / 2, a.img.y - (ny * overlap) / 2);
    const cb = this.clampToTable(b.img.x + (nx * overlap) / 2, b.img.y + (ny * overlap) / 2);
    a.img.x = ca.x;
    a.img.y = ca.y;
    b.img.x = cb.x;
    b.img.y = cb.y;
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
    this.destroyDrink(a.img);
    this.destroyDrink(b.img);
    this.pucks.splice(j, 1);
    this.pucks.splice(i, 1);
    const img = this.spawnDrink(tier, mx, my);
    img.setData("pop", 1.45);
    this.pucks.push({ img, tier, vx, vy });

    const res = G.registerMerge(tier, this.now());
    const col = tierColor(tier);
    this.floatText(mx, my - 20 * SS, `+${fmt(res.coins)}`, res.crit ? "#ffe66b" : "#d6ffdd", res.crit);
    this.burst(mx, my, col, res.crit ? 26 : 14);
    if (tier >= 6) this.cameras.main.shake(120, 0.0025 * Math.min(tier, 12));
    if (res.comboCount >= 3) this.comboFlash(res.comboCount);
  }

  // ── juice ───────────────────────────────────────────────────────────────────
  private floatText(x: number, y: number, text: string, color: string, big = false) {
    const t = this.add
      .text(x, y, text, {
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: `${(big ? 52 : 40) * 1}px`,
        color,
        stroke: "#2a1808",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(50000);
    this.tweens.add({
      targets: t,
      y: y - 110 * SS,
      alpha: 0,
      scale: big ? 1.3 : 1,
      duration: 900,
      ease: "Cubic.out",
      onComplete: () => t.destroy(),
    });
  }

  private comboFlash(count: number) {
    const t = this.add
      .text(CENTER_X, DESIGN.h * 0.42, `COMBO x${count}`, {
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: `${64 * 1}px`,
        color: "#ffd54a",
        stroke: "#5a2d00",
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(50000)
      .setScale(0.5);
    this.tweens.add({ targets: t, scale: 1.1, duration: 160, ease: "Back.out", yoyo: false });
    this.tweens.add({ targets: t, alpha: 0, duration: 700, delay: 250, onComplete: () => t.destroy() });
  }

  private burst(x: number, y: number, color: number, count: number) {
    const e = this.add.particles(x, y, "spark", {
      speed: { min: 120 * SS, max: 420 * SS },
      lifespan: 550,
      scale: { start: 0.5 * SS, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: color,
      blendMode: "ADD",
      emitting: false,
    });
    e.setDepth(49000);
    e.explode(count, x, y);
    this.time.delayedCall(700, () => e.destroy());
  }
}
