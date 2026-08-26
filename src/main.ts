import Phaser from "phaser";

// Idle Bartender — iteration 1. Just the feel: shots slide up the tiki-bar table (vertically, away
// from the bartender toward the counter), shrinking with the table's perspective. No scoring/save yet;
// the @andusystems/games-sdk (save/leaderboard) comes back in a later iteration.
//
// Design canvas matches the background art (720x1280, portrait). Scale.FIT keeps the whole bar visible
// on any device (letterboxed with the page's navy where aspect ratios differ).
const DESIGN_W = 720;
const DESIGN_H = 1280;
const CENTER_X = DESIGN_W * 0.5;

// The slide path down the receding bar table, tuned to the background framing:
//   NEAR = the bartender's end (bottom, wide, shots are big) → FAR = the counter (top, narrow, small).
// Shots spawn spread across the near edge and converge toward the vanishing point as they slide up.
const NEAR = { y: 1185, scale: 0.36, xSpread: 120 };
const FAR = { y: 430, scale: 0.15 };

class BarScene extends Phaser.Scene {
  constructor() {
    super("bar");
  }

  preload() {
    this.load.image("bg", "assets/background.jpg");
    this.load.image("shot", "assets/shot.png");
  }

  create() {
    this.add.image(DESIGN_W / 2, DESIGN_H / 2, "bg").setDisplaySize(DESIGN_W, DESIGN_H).setDepth(0);

    // Fading hint so a first-time player knows it's interactive.
    const hint = this.add
      .text(CENTER_X, DESIGN_H * 0.92, "tap to slide a shot", {
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "36px",
        color: "#fff8e7",
        stroke: "#3a2410",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(10000)
      .setAlpha(0);
    this.tweens.add({ targets: hint, alpha: 0.9, duration: 500, yoyo: true, hold: 1800, onComplete: () => hint.destroy() });

    // Tap anywhere to send a shot; a steady stream also flows on its own.
    this.input.on("pointerdown", () => this.slideShot());
    this.time.addEvent({ delay: 1400, loop: true, callback: () => this.slideShot() });
    this.time.delayedCall(350, () => this.slideShot());
  }

  private slideShot() {
    const startX = CENTER_X + Phaser.Math.Between(-NEAR.xSpread, NEAR.xSpread);
    // origin near the base of the glass so it "sits" on the table as it travels.
    const shot = this.add.image(startX, NEAR.y, "shot").setOrigin(0.5, 0.82).setScale(NEAR.scale).setDepth(NEAR.y);

    this.tweens.add({
      targets: shot,
      x: CENTER_X, // converge toward the vanishing point
      y: FAR.y,
      scale: FAR.scale,
      ease: "Cubic.easeOut", // glides fast then eases as it reaches the patron
      duration: Phaser.Math.Between(1500, 1900),
      onUpdate: () => shot.setDepth(shot.y), // nearer shots (lower on screen) draw over farther ones
      onComplete: () => {
        this.tweens.add({ targets: shot, alpha: 0, scale: FAR.scale * 0.88, duration: 220, onComplete: () => shot.destroy() });
      },
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b1e3f",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN_W,
    height: DESIGN_H,
  },
  scene: [BarScene],
});
