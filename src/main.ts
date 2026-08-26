import Phaser from "phaser";

// Idle Bartender — iteration 1. A shot sits on the tiki-bar table; the player slides it FREELY around
// the table with their gesture — drag it anywhere on the wooden surface, or flick it and it glides to a
// stop. It shrinks/grows with the table's perspective as it moves toward/away from the counter, and it
// STAYS wherever you leave it — nothing auto-moves and nothing disappears.
//
// Design canvas matches the background art (720x1280, portrait). Scale.ENVELOP fills the whole screen.
const DESIGN_W = 720;
const DESIGN_H = 1280;
const CENTER_X = DESIGN_W * 0.5;

// The playable wooden table is a perspective trapezoid: wide at the near/bottom edge, narrowing to the
// far/counter end. The shot may go anywhere inside it; scale interpolates near→far by height.
const TABLE = {
  nearY: 1185, // bottom (near the bartender)
  farY: 430, // top (at the counter)
  nearHalf: 330, // half-width of the table at the bottom
  farHalf: 150, // half-width at the counter
  nearScale: 0.36,
  farScale: 0.15,
};

class BarScene extends Phaser.Scene {
  private shot!: Phaser.GameObjects.Image;
  private hint?: Phaser.GameObjects.Text;
  private dragging = false;
  private grabDX = 0; // pointer→shot offset so it doesn't jump on grab
  private grabDY = 0;
  private vx = 0; // flick momentum (px/sec)
  private vy = 0;

  constructor() {
    super("bar");
  }

  preload() {
    this.load.image("bg", "assets/background.jpg");
    this.load.image("shot", "assets/shot.png");
  }

  create() {
    this.add.image(DESIGN_W / 2, DESIGN_H / 2, "bg").setDisplaySize(DESIGN_W, DESIGN_H).setDepth(0);

    this.hint = this.add
      .text(CENTER_X, DESIGN_H * 0.62, "slide the shot around the bar", {
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

    // One shot, resting near the bottom center — slide it wherever you like.
    this.shot = this.add.image(CENTER_X, TABLE.nearY, "shot").setOrigin(0.5, 0.82);
    this.applyPerspective();

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  // 0 at the near/bottom edge → 1 at the far/counter end.
  private progressAt(y: number) {
    return Phaser.Math.Clamp((TABLE.nearY - y) / (TABLE.nearY - TABLE.farY), 0, 1);
  }

  private applyPerspective() {
    const t = this.progressAt(this.shot.y);
    this.shot.setScale(Phaser.Math.Linear(TABLE.nearScale, TABLE.farScale, t));
    this.shot.setDepth(this.shot.y); // nearer (lower) draws over farther
  }

  // Clamp a target position to the trapezoidal table surface.
  private clampToTable(x: number, y: number) {
    const cy = Phaser.Math.Clamp(y, TABLE.farY, TABLE.nearY);
    const hw = Phaser.Math.Linear(TABLE.nearHalf, TABLE.farHalf, this.progressAt(cy));
    const cx = Phaser.Math.Clamp(x, CENTER_X - hw, CENTER_X + hw);
    return { x: cx, y: cy };
  }

  private onDown(p: Phaser.Input.Pointer) {
    // grab only if the press is on/near the shot (generous radius, scales with the sprite).
    const grabR = Math.max(this.shot.displayWidth, this.shot.displayHeight) * 0.75 + 40;
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
    const { x, y } = this.clampToTable(p.x + this.grabDX, p.y + this.grabDY);
    this.shot.x = x;
    this.shot.y = y;
    this.applyPerspective();
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (!this.dragging) return;
    this.dragging = false;
    this.vx = Phaser.Math.Clamp(p.velocity.x, -2600, 2600);
    this.vy = Phaser.Math.Clamp(p.velocity.y, -2600, 2600);
  }

  // Flick glide with friction, clamped to the table (stops at edges). Shot persists — never removed.
  update(_t: number, dt: number) {
    if (this.dragging || (Math.abs(this.vx) < 4 && Math.abs(this.vy) < 4)) {
      this.vx = 0;
      this.vy = 0;
      return;
    }
    const step = dt / 1000;
    const nx = this.shot.x + this.vx * step;
    const ny = this.shot.y + this.vy * step;
    const c = this.clampToTable(nx, ny);
    if (c.x !== nx) this.vx = 0; // hit a side rail
    if (c.y !== ny) this.vy = 0; // hit the near/far edge
    this.shot.x = c.x;
    this.shot.y = c.y;
    this.applyPerspective();
    const friction = Math.pow(0.9, dt / 16.67);
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
