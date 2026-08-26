import Phaser from "phaser";

// Idle Bartender — iteration 1. A shot sits READY at the bartender's end (bottom); the player SWIPES it
// up the tiki-bar table with their own gesture — nothing moves on its own. It shrinks with the table's
// perspective as it travels; release far enough (or flick upward) to send it to the counter, otherwise
// it glides back to the ready spot for another go.
//
// Design canvas matches the background art (720x1280, portrait). Scale.ENVELOP covers the whole screen
// on mobile (fills edge-to-edge, cropping any overflow) instead of letterboxing.
const DESIGN_W = 720;
const DESIGN_H = 1280;
const CENTER_X = DESIGN_W * 0.5;

// Slide path down the receding bar table: NEAR = bartender's end (bottom, big) → FAR = counter (top, small).
const NEAR = { y: 1185, scale: 0.36 };
const FAR = { y: 430, scale: 0.15 };

class BarScene extends Phaser.Scene {
  private shot?: Phaser.GameObjects.Image;
  private hint?: Phaser.GameObjects.Text;
  private dragging = false;
  private busy = false; // a shot is completing its slide / being re-served

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
      .text(CENTER_X, DESIGN_H * 0.7, "swipe the shot up the bar", {
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "36px",
        color: "#fff8e7",
        stroke: "#3a2410",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(10000)
      .setAlpha(0);
    this.tweens.add({ targets: this.hint, alpha: 0.9, duration: 500 });

    this.serveShot();

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  // A fresh shot waiting, static, at the bartender's end (bottom center).
  private serveShot() {
    this.shot = this.add.image(CENTER_X, NEAR.y, "shot").setOrigin(0.5, 0.82).setScale(NEAR.scale).setDepth(NEAR.y);
    this.busy = false;
  }

  // 0 at the near/bottom edge → 1 at the far/counter end.
  private progressAt(y: number) {
    return Phaser.Math.Clamp((NEAR.y - y) / (NEAR.y - FAR.y), 0, 1);
  }

  // Place the shot along the perspective track for a pointer position (converging toward the vanishing point).
  private track(x: number, y: number) {
    if (!this.shot) return;
    const t = this.progressAt(y);
    this.shot.y = y;
    this.shot.x = Phaser.Math.Linear(x, CENTER_X, t * t);
    this.shot.setScale(Phaser.Math.Linear(NEAR.scale, FAR.scale, t));
    this.shot.setDepth(y);
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (this.busy || !this.shot) return;
    if (p.y > DESIGN_H * 0.45) {
      // grab from the lower half — begin the swipe
      this.dragging = true;
      if (this.hint) {
        this.tweens.add({ targets: this.hint, alpha: 0, duration: 200, onComplete: () => this.hint?.destroy() });
        this.hint = undefined;
      }
    }
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!this.dragging || !this.shot) return;
    this.track(p.x, Math.min(p.y, NEAR.y)); // only travels up the bar, never below the start line
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (!this.dragging || !this.shot) return;
    this.dragging = false;
    const t = this.progressAt(this.shot.y);
    const flickedUp = p.velocity.y < -350;
    if (t > 0.3 || flickedUp) this.completeSlide();
    else this.returnShot();
  }

  // Carry the shot the rest of the way to the counter, then serve the next one.
  private completeSlide() {
    if (!this.shot) return;
    this.busy = true;
    const shot = this.shot;
    this.shot = undefined;
    const remaining = 1 - this.progressAt(shot.y);
    this.tweens.add({
      targets: shot,
      x: CENTER_X,
      y: FAR.y,
      scale: FAR.scale,
      ease: "Cubic.easeOut",
      duration: 250 + remaining * 850,
      onUpdate: () => shot.setDepth(shot.y),
      onComplete: () => {
        this.tweens.add({ targets: shot, alpha: 0, scale: FAR.scale * 0.88, duration: 220, onComplete: () => shot.destroy() });
        this.serveShot();
      },
    });
  }

  // Not far enough — glide back to the ready position for another swipe.
  private returnShot() {
    if (!this.shot) return;
    const shot = this.shot;
    this.tweens.add({
      targets: shot,
      x: CENTER_X,
      y: NEAR.y,
      scale: NEAR.scale,
      ease: "Back.easeOut",
      duration: 320,
      onUpdate: () => shot.setDepth(shot.y),
    });
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
