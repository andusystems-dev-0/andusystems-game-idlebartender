import Phaser from "phaser";
import { DESIGN, CENTER_X, UPGRADES, META, DRINK_NAMES, PRESTIGE } from "./config";
import * as G from "./state";
import { fmt, fmtDuration } from "./format";

const FONT = "system-ui, -apple-system, sans-serif";
const CREAM = "#fff8e7";

// A simple pressable button (rectangle + label + optional sub-label) as a Container.
interface Btn {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  txt: Phaser.GameObjects.Text;
  sub?: Phaser.GameObjects.Text;
  enabled: boolean;
}

export class UIScene extends Phaser.Scene {
  private coins!: Phaser.GameObjects.Text;
  private rate!: Phaser.GameObjects.Text;
  private tokens!: Phaser.GameObjects.Text;
  private center!: Phaser.GameObjects.Text;
  private lastCall!: Btn;
  private modal?: Phaser.GameObjects.Container;
  private modalRefresh: (() => void) | null = null;

  constructor() {
    super("ui");
  }

  create() {
    // top HUD strip
    this.add.rectangle(CENTER_X, 175, DESIGN.w, 300, 0x140d04, 0.34).setDepth(100);

    this.coins = this.text(190, 130, "", 46, CREAM).setOrigin(0, 0.5).setDepth(101);
    this.rate = this.text(190, 205, "", 30, "#9fe0b0").setOrigin(0, 0.5).setDepth(101);
    this.tokens = this.text(DESIGN.w - 190, 130, "", 44, "#ffe08a").setOrigin(1, 0.5).setDepth(101);
    this.center = this.text(CENTER_X, 150, "", 40, CREAM).setOrigin(0.5).setDepth(101);

    // action buttons
    this.makeButton(360, 320, 380, 120, "Shop", 44, () => this.openShop(), 0x3a6ea5);
    this.lastCall = this.makeButton(DESIGN.w - 360, 320, 480, 120, "Last Call", 44, () => this.openPrestige(), 0x8a4b9a, "");

    // welcome-back popup
    if (G.T.offlineEarned > 0) this.showWelcomeBack();
  }

  update() {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.coins.setText(`💰 ${fmt(G.S.coins)}`);
    const r = G.idleCoinsPerSec();
    this.rate.setText(r > 0 ? `+${fmt(r)}/s` : "").setVisible(r > 0);
    this.tokens.setText(`⭐ ${fmt(G.S.prestige.tokens)}`);

    if (G.comboActive(now)) {
      this.center.setText(`x${G.comboMult(now).toFixed(1)}  COMBO ${G.T.comboCount}`).setColor("#ffd54a");
    } else {
      this.center.setText(`Score ${fmt(G.S.runScore)}`).setColor(CREAM);
    }

    // Last Call button reflects progress
    const can = G.canPrestige();
    this.setBtnEnabled(this.lastCall, can);
    this.lastCall.sub?.setText(can ? `⭐ +${fmt(G.prestigeTokens())}` : `reach ${DRINK_NAMES[PRESTIGE.tierGate]}`);

    if (this.modalRefresh) this.modalRefresh();
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  private text(x: number, y: number, s: string, size: number, color: string) {
    return this.add.text(x, y, s, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color,
      stroke: "#2a1808",
      strokeThickness: Math.max(3, size * 0.12),
    });
  }

  private makeButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    size: number,
    cb: () => void,
    color: number,
    sub?: string,
    depth = 102,
  ): Btn {
    const bg = this.add.rectangle(0, 0, w, h, color, 1).setStrokeStyle(3, 0xffffff, 0.35);
    const txt = this.add
      .text(0, sub != null ? -h * 0.16 : 0, label, { fontFamily: FONT, fontSize: `${size}px`, color: CREAM })
      .setOrigin(0.5);
    const kids: Phaser.GameObjects.GameObject[] = [bg, txt];
    let subTxt: Phaser.GameObjects.Text | undefined;
    if (sub != null) {
      subTxt = this.add
        .text(0, h * 0.26, sub, { fontFamily: FONT, fontSize: `${size * 0.62}px`, color: "#ffe9c2" })
        .setOrigin(0.5);
      kids.push(subTxt);
    }
    const root = this.add.container(x, y, kids).setDepth(depth);
    const btn: Btn = { root, bg, txt, sub: subTxt, enabled: true };
    root.setSize(w, h);
    root.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    root.on("pointerdown", () => btn.enabled && root.setScale(0.96));
    root.on("pointerup", () => {
      root.setScale(1);
      if (btn.enabled) cb();
    });
    root.on("pointerout", () => root.setScale(1));
    return btn;
  }

  private setBtnEnabled(b: Btn, enabled: boolean) {
    if (b.enabled === enabled) return;
    b.enabled = enabled;
    b.root.setAlpha(enabled ? 1 : 0.45);
  }

  // ── modal framework ────────────────────────────────────────────────────────
  private openModal(closeOnBackdrop = true): Phaser.GameObjects.Container {
    this.closeModal();
    G.T.modalOpen = true;
    const c = this.add.container(0, 0).setDepth(500);
    const backdrop = this.add.rectangle(CENTER_X, DESIGN.h / 2, DESIGN.w, DESIGN.h, 0x000000, 0.62);
    backdrop.setInteractive();
    if (closeOnBackdrop) backdrop.on("pointerup", () => this.closeModal());
    c.add(backdrop);
    this.modal = c;
    return c;
  }

  private closeModal() {
    this.modalRefresh = null;
    this.modal?.destroy();
    this.modal = undefined;
    G.T.modalOpen = false;
  }

  private panel(c: Phaser.GameObjects.Container, top: number, bottom: number, title: string) {
    const midY = (top + bottom) / 2;
    const h = bottom - top;
    const w = DESIGN.w - 200;
    // interactive so taps on the panel body are absorbed (only ✕ or the outside backdrop closes it)
    c.add(this.add.rectangle(CENTER_X, midY, w, h, 0x1a1206, 0.96).setStrokeStyle(4, 0xffcf8a, 0.5).setInteractive());
    c.add(this.text(CENTER_X, top + 70, title, 56, "#ffd9a0").setOrigin(0.5));
    // close X
    const close = this.text(CENTER_X + w / 2 - 70, top + 60, "✕", 52, CREAM).setOrigin(0.5);
    close.setInteractive({ useHandCursor: true }).on("pointerup", () => this.closeModal());
    c.add(close);
    return { w, top, bottom };
  }

  // ── shop ─────────────────────────────────────────────────────────────────
  private openShop() {
    if (G.T.modalOpen) return;
    const c = this.openModal();
    const top = 260;
    const bottom = DESIGN.h - 220;
    const { w } = this.panel(c, top, bottom, "The Back Bar");

    const x0 = CENTER_X - w / 2 + 60;
    const rowH = (bottom - top - 200) / UPGRADES.length;
    const refreshers: Array<() => void> = [];

    UPGRADES.forEach((u, i) => {
      const y = top + 170 + rowH * (i + 0.5);
      c.add(this.text(x0, y - 34, u.name, 40, CREAM).setOrigin(0, 0.5));
      c.add(this.text(x0, y + 26, u.desc, 27, "#d9c9ad").setOrigin(0, 0.5));
      const lvlTxt = this.text(CENTER_X + w / 2 - 470, y, "", 32, "#bfe9ff").setOrigin(0.5, 0.5);
      c.add(lvlTxt);
      const buy = this.makeButton(CENTER_X + w / 2 - 210, y, 320, rowH * 0.8, "", 34, () => G.buyUpgrade(u.id), 0x2f7d47, "", 501);
      c.add(buy.root);
      refreshers.push(() => {
        const maxed = G.upgradeMaxed(u.id);
        lvlTxt.setText(`Lv ${G.lvl(u.id)}/${u.max}`);
        buy.txt.setText(maxed ? "MAX" : "Buy");
        buy.sub?.setText(maxed ? "" : `💰 ${fmt(G.upgradeCost(u.id))}`);
        const afford = !maxed && G.S.coins >= G.upgradeCost(u.id);
        this.setBtnEnabled(buy, afford);
        buy.bg.setFillStyle(maxed ? 0x555555 : afford ? 0x2f7d47 : 0x6b3a3a, 1);
      });
    });
    this.modalRefresh = () => refreshers.forEach((f) => f());
    this.modalRefresh();
  }

  // ── prestige ────────────────────────────────────────────────────────────
  private openPrestige() {
    if (G.T.modalOpen) return;
    const c = this.openModal();
    const top = 240;
    const bottom = DESIGN.h - 200;
    const { w } = this.panel(c, top, bottom, "Last Call");

    const info = this.text(CENTER_X, top + 190, "", 34, CREAM).setOrigin(0.5).setAlign("center");
    (info as Phaser.GameObjects.Text).setLineSpacing(14);
    c.add(info);

    // meta upgrades (spend tokens, permanent)
    c.add(this.text(CENTER_X, top + 360, "Legacy (permanent — spend ⭐)", 34, "#ffd9a0").setOrigin(0.5));
    const x0 = CENTER_X - w / 2 + 60;
    const startY = top + 430;
    const rowH = 150;
    const refreshers: Array<() => void> = [];
    META.forEach((m, i) => {
      const y = startY + rowH * i;
      c.add(this.text(x0, y - 30, m.name, 38, CREAM).setOrigin(0, 0.5));
      c.add(this.text(x0, y + 26, m.desc, 26, "#d9c9ad").setOrigin(0, 0.5));
      const lvlTxt = this.text(CENTER_X + w / 2 - 470, y, "", 30, "#bfe9ff").setOrigin(0.5);
      c.add(lvlTxt);
      const buy = this.makeButton(CENTER_X + w / 2 - 210, y, 320, 110, "", 32, () => G.buyMeta(m.id), 0x7a5cc0, "", 501);
      c.add(buy.root);
      refreshers.push(() => {
        const maxed = G.metaMaxed(m.id);
        lvlTxt.setText(`Lv ${G.metaLvl(m.id)}/${m.max}`);
        buy.txt.setText(maxed ? "MAX" : "Unlock");
        buy.sub?.setText(maxed ? "" : `⭐ ${fmt(G.metaCost(m.id))}`);
        const afford = !maxed && G.S.prestige.tokens >= G.metaCost(m.id);
        this.setBtnEnabled(buy, afford);
        buy.bg.setFillStyle(maxed ? 0x555555 : afford ? 0x7a5cc0 : 0x5a4a6b, 1);
      });
    });

    // close-out button
    const closeOut = this.makeButton(CENTER_X, bottom - 110, 760, 130, "Close Out the Night", 42, () => this.showDraft(), 0xc0602a, "", 501);
    c.add(closeOut.root);

    this.modalRefresh = () => {
      const can = G.canPrestige();
      info.setText(
        `Best drink: ${DRINK_NAMES[G.S.bestTierRun]}\n` +
          `Run score: ${fmt(G.S.runScore)}\n` +
          (can
            ? `Close out to earn ⭐ ${fmt(G.prestigeTokens())} and draft a boon`
            : `Reach ${DRINK_NAMES[PRESTIGE.tierGate]} to call last orders`),
      );
      this.setBtnEnabled(closeOut, can);
      closeOut.bg.setFillStyle(can ? 0xc0602a : 0x5a4a3a, 1);
      refreshers.forEach((f) => f());
    };
    this.modalRefresh();
  }

  // roguelike boon draft — pick 1 of N, then the run resets
  private showDraft() {
    if (!G.canPrestige()) return;
    const c = this.openModal(false);
    const top = 300;
    const bottom = DESIGN.h - 300;
    this.panel(c, top, bottom, "Pick a Boon");
    c.add(this.text(CENTER_X, top + 150, `You earned ⭐ ${fmt(G.prestigeTokens())} — choose one to keep forever:`, 30, CREAM).setOrigin(0.5));

    const picks = G.draftBoons();
    const cardW = 520;
    const gap = 40;
    const startY = top + 260;
    picks.forEach((b, i) => {
      const y = startY + (140 + gap) * i;
      const card = this.makeButton(CENTER_X, y + 70, cardW, 140, b.name, 40, () => {
        G.doPrestige(b.id);
        this.closeModal();
        this.flash(`${b.name} acquired!`);
      }, 0x2f6d7d, "", 501);
      // put the description as the sub-label
      card.sub?.setText(b.desc);
      card.sub?.setColor("#d6f4ff");
      c.add(card.root);
    });
  }

  private showWelcomeBack() {
    const c = this.openModal(false);
    const top = DESIGN.h * 0.32;
    const bottom = DESIGN.h * 0.68;
    this.panel(c, top, bottom, "Welcome Back");
    c.add(
      this.text(
        CENTER_X,
        (top + bottom) / 2 - 20,
        `Your bar ran for ${fmtDuration(G.T.offlineSeconds)}\nand earned 💰 ${fmt(G.T.offlineEarned)}`,
        36,
        CREAM,
      )
        .setOrigin(0.5)
        .setAlign("center")
        .setLineSpacing(16),
    );
    const ok = this.makeButton(CENTER_X, bottom - 90, 360, 110, "Cheers!", 40, () => this.closeModal(), 0x2f7d47, "", 501);
    c.add(ok.root);
    G.T.offlineEarned = 0;
  }

  private flash(msg: string) {
    const t = this.text(CENTER_X, DESIGN.h * 0.5, msg, 52, "#ffe08a").setOrigin(0.5).setDepth(600);
    this.tweens.add({ targets: t, y: t.y - 120, alpha: 0, duration: 1400, ease: "Cubic.out", onComplete: () => t.destroy() });
  }
}
