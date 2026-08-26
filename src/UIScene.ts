import Phaser from "phaser";
import { DESIGN, CENTER_X, UPGRADES, META, DRINK_NAMES, PRESTIGE } from "./config";
import * as G from "./state";
import { fmt, fmtDuration } from "./format";

const FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const CREAM = "#fff8e7";
const SUB = "#cdbfa6";
const GOLD = "#ffd68a";

// palette (fills)
const C = {
  panel: 0x1c140b,
  amber: 0xe8983a,
  amberDk: 0xb86c24,
  teal: 0x2ba69a,
  green: 0x36a95c,
  greenDk: 0x2b7a46,
  purple: 0x7c5cd0,
  neutral: 0x3a2f24,
  disabled: 0x453b30,
  muteRed: 0x7c4a3f,
};

interface Btn {
  root: Phaser.GameObjects.Container;
  g: Phaser.GameObjects.Graphics;
  txt: Phaser.GameObjects.Text;
  sub?: Phaser.GameObjects.Text;
  w: number;
  h: number;
  enabled: boolean;
}

export class UIScene extends Phaser.Scene {
  private top!: Phaser.GameObjects.Container; // safe-area-shifted HUD
  private coinsTxt!: Phaser.GameObjects.Text;
  private rateTxt!: Phaser.GameObjects.Text;
  private tokensTxt!: Phaser.GameObjects.Text;
  private centerTxt!: Phaser.GameObjects.Text;
  private centerPill!: Phaser.GameObjects.Graphics;
  private lastCall!: Btn;
  private modal?: Phaser.GameObjects.Container;
  private modalRefresh: (() => void) | null = null;

  constructor() {
    super("ui");
  }

  create() {
    this.top = this.add.container(0, 0).setDepth(100);

    // coins chip (left)
    this.top.add(this.pill(350, 100, 460, 108, C.panel, 0.82));
    this.coinsTxt = this.text(350, 96, "", 46, GOLD).setOrigin(0.5).setDepth(101);
    this.rateTxt = this.text(350, 174, "", 30, "#9fe0b0").setOrigin(0.5).setDepth(101);
    this.top.add(this.coinsTxt);
    this.top.add(this.rateTxt);

    // tokens chip (right)
    this.top.add(this.pill(1090, 100, 380, 108, C.panel, 0.82));
    this.tokensTxt = this.text(1090, 100, "", 44, "#c9b6ff").setOrigin(0.5).setDepth(101);
    this.top.add(this.tokensTxt);

    // combo / score (center)
    this.centerPill = this.pill(725, 100, 380, 96, C.panel, 0.0);
    this.top.add(this.centerPill);
    this.centerTxt = this.text(725, 100, "", 38, CREAM).setOrigin(0.5).setDepth(101);
    this.top.add(this.centerTxt);

    // action buttons
    const shop = this.makeButton(360, 262, 440, 128, "Shop", 46, () => this.openShop(), C.teal);
    this.lastCall = this.makeButton(1080, 262, 470, 128, "Last Call", 44, () => this.openPrestige(), C.purple, "");
    this.top.add(shop.root);
    this.top.add(this.lastCall.root);

    if (G.T.offlineEarned > 0) this.showWelcomeBack();
  }

  update() {
    this.top.setY(G.T.safeTop);

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.coinsTxt.setText(`💰 ${fmt(G.S.coins)}`);
    const r = G.idleCoinsPerSec();
    this.rateTxt.setText(r > 0 ? `+${fmt(r)}/s` : "").setVisible(r > 0);
    this.tokensTxt.setText(`⭐ ${fmt(G.S.prestige.tokens)}`);

    if (G.comboActive(now)) {
      this.centerTxt.setText(`x${G.comboMult(now).toFixed(1)}  🔥${G.T.comboCount}`).setColor("#ffd54a");
      this.centerPill.setAlpha(0.85);
    } else {
      this.centerTxt.setText(`${fmt(G.S.runScore)}`).setColor(CREAM);
      this.centerPill.setAlpha(0);
    }

    const can = G.canPrestige();
    this.setBtnEnabled(this.lastCall, can);
    this.paintButton(this.lastCall, can ? C.purple : C.disabled, can);
    this.lastCall.sub?.setText(can ? `⭐ +${fmt(G.prestigeTokens())}` : `reach ${DRINK_NAMES[PRESTIGE.tierGate]}`);

    if (this.modalRefresh) this.modalRefresh();
  }

  // ── style helpers ──────────────────────────────────────────────────────────
  private text(x: number, y: number, s: string, size: number, color: string) {
    const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color });
    t.setShadow(0, Math.max(2, size * 0.06), "rgba(0,0,0,0.6)", Math.max(2, size * 0.1), false, true);
    return t;
  }

  private pill(x: number, y: number, w: number, h: number, color: number, alpha: number) {
    const g = this.add.graphics().setDepth(100);
    if (alpha > 0) {
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(x - w / 2, y - h / 2 + 5, w, h, h / 2);
    }
    g.fillStyle(color, alpha);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
    g.lineStyle(2, 0xffffff, alpha > 0 ? 0.16 : 0);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
    return g;
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
    const g = this.add.graphics();
    const txt = this.add
      .text(0, sub != null ? -h * 0.16 : 0, label, { fontFamily: FONT, fontSize: `${size}px`, color: CREAM })
      .setOrigin(0.5);
    txt.setShadow(0, 3, "rgba(0,0,0,0.55)", 4, false, true);
    const kids: Phaser.GameObjects.GameObject[] = [g, txt];
    let subTxt: Phaser.GameObjects.Text | undefined;
    if (sub != null) {
      subTxt = this.add
        .text(0, h * 0.24, sub, { fontFamily: FONT, fontSize: `${size * 0.6}px`, color: "#ffe9c2" })
        .setOrigin(0.5);
      kids.push(subTxt);
    }
    const root = this.add.container(x, y, kids).setDepth(depth);
    const btn: Btn = { root, g, txt, sub: subTxt, w, h, enabled: true };
    this.paintButton(btn, color, true);
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

  private paintButton(b: Btn, color: number, enabled: boolean) {
    const { g, w, h } = b;
    const r = Math.min(h * 0.36, 46);
    g.clear();
    g.fillStyle(0x000000, 0.32);
    g.fillRoundedRect(-w / 2, -h / 2 + 7, w, h, r);
    g.fillStyle(color, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.16);
    g.fillRoundedRect(-w / 2, -h / 2, w, h * 0.5, { tl: r, tr: r, bl: 0, br: 0 });
    g.lineStyle(3, 0xffffff, enabled ? 0.4 : 0.15);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  }

  private setBtnEnabled(b: Btn, enabled: boolean) {
    b.enabled = enabled;
    b.root.setAlpha(enabled ? 1 : 0.7);
  }

  // ── modal framework ──────────────────────────────────────────────────────
  private openModal(closeOnBackdrop = true): Phaser.GameObjects.Container {
    this.closeModal();
    G.T.modalOpen = true;
    const c = this.add.container(0, 0).setDepth(500);
    const backdrop = this.add.rectangle(CENTER_X, DESIGN.h / 2, DESIGN.w, DESIGN.h, 0x000000, 0.66).setInteractive();
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

  private drawPanel(c: Phaser.GameObjects.Container, top: number, bottom: number, title: string) {
    const w = DESIGN.w - 170;
    const h = bottom - top;
    const x = CENTER_X - w / 2;
    const r = 54;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(x, top + 12, w, h, r);
    g.fillStyle(C.panel, 0.98);
    g.fillRoundedRect(x, top, w, h, r);
    g.fillStyle(0xffffff, 0.05);
    g.fillRoundedRect(x, top, w, h * 0.1, { tl: r, tr: r, bl: 0, br: 0 });
    g.lineStyle(3, 0xffd08a, 0.45);
    g.strokeRoundedRect(x, top, w, h, r);
    g.setInteractive(new Phaser.Geom.Rectangle(x, top, w, h), Phaser.Geom.Rectangle.Contains); // absorb taps
    c.add(g);
    c.add(this.text(CENTER_X, top + 78, title, 58, GOLD).setOrigin(0.5));
    const close = this.makeButton(x + w - 86, top + 82, 108, 108, "✕", 48, () => this.closeModal(), C.neutral, undefined, 501);
    c.add(close.root);
    return { w, x, top, bottom };
  }

  private rowBg(c: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number) {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.04);
    g.fillRoundedRect(x, y - h / 2, w, h, 26);
    c.add(g);
  }

  // ── shop ───────────────────────────────────────────────────────────────────
  private openShop() {
    if (G.T.modalOpen) return;
    const c = this.openModal();
    const top = 250 + G.T.safeTop;
    const bottom = DESIGN.h - 200;
    const { w, x } = this.drawPanel(c, top, bottom, "The Back Bar");

    const listTop = top + 170;
    const rowH = (bottom - listTop - 40) / UPGRADES.length;
    const refreshers: Array<() => void> = [];
    UPGRADES.forEach((u, i) => {
      const y = listTop + rowH * (i + 0.5);
      this.rowBg(c, x + 40, y, w - 80, rowH - 18);
      c.add(this.text(x + 80, y - 32, u.name, 40, CREAM).setOrigin(0, 0.5));
      c.add(this.text(x + 80, y + 30, u.desc, 27, SUB).setOrigin(0, 0.5));
      const lvlTxt = this.text(x + w - 520, y, "", 32, "#bfe9ff").setOrigin(0.5);
      c.add(lvlTxt);
      const buy = this.makeButton(x + w - 230, y, 320, rowH * 0.72, "", 34, () => G.buyUpgrade(u.id), C.green, "", 501);
      c.add(buy.root);
      refreshers.push(() => {
        const maxed = G.upgradeMaxed(u.id);
        lvlTxt.setText(`Lv ${G.lvl(u.id)}/${u.max}`);
        buy.txt.setText(maxed ? "MAX" : "Buy");
        buy.sub?.setText(maxed ? "" : `💰 ${fmt(G.upgradeCost(u.id))}`);
        const afford = !maxed && G.S.coins >= G.upgradeCost(u.id);
        this.setBtnEnabled(buy, afford || maxed);
        this.paintButton(buy, maxed ? C.neutral : afford ? C.green : C.muteRed, afford);
      });
    });
    this.modalRefresh = () => refreshers.forEach((f) => f());
    this.modalRefresh();
  }

  // ── prestige ─────────────────────────────────────────────────────────────
  private openPrestige() {
    if (G.T.modalOpen) return;
    const c = this.openModal();
    const top = 240 + G.T.safeTop;
    const bottom = DESIGN.h - 190;
    const { w, x } = this.drawPanel(c, top, bottom, "Last Call");

    const info = this.text(CENTER_X, top + 210, "", 34, CREAM).setOrigin(0.5).setAlign("center");
    info.setLineSpacing(14);
    c.add(info);

    c.add(this.text(CENTER_X, top + 400, "LEGACY — permanent, spend ⭐", 32, GOLD).setOrigin(0.5));
    const startY = top + 480;
    const rowH = 156;
    const refreshers: Array<() => void> = [];
    META.forEach((m, i) => {
      const y = startY + rowH * i;
      this.rowBg(c, x + 40, y, w - 80, rowH - 20);
      c.add(this.text(x + 80, y - 30, m.name, 38, CREAM).setOrigin(0, 0.5));
      c.add(this.text(x + 80, y + 28, m.desc, 26, SUB).setOrigin(0, 0.5));
      const lvlTxt = this.text(x + w - 520, y, "", 30, "#c9b6ff").setOrigin(0.5);
      c.add(lvlTxt);
      const buy = this.makeButton(x + w - 230, y, 320, 112, "", 32, () => G.buyMeta(m.id), C.purple, "", 501);
      c.add(buy.root);
      refreshers.push(() => {
        const maxed = G.metaMaxed(m.id);
        lvlTxt.setText(`Lv ${G.metaLvl(m.id)}/${m.max}`);
        buy.txt.setText(maxed ? "MAX" : "Unlock");
        buy.sub?.setText(maxed ? "" : `⭐ ${fmt(G.metaCost(m.id))}`);
        const afford = !maxed && G.S.prestige.tokens >= G.metaCost(m.id);
        this.setBtnEnabled(buy, afford || maxed);
        this.paintButton(buy, maxed ? C.neutral : afford ? C.purple : C.muteRed, afford);
      });
    });

    const closeOut = this.makeButton(CENTER_X, bottom - 120, 800, 140, "Close Out the Night", 44, () => this.showDraft(), C.amber, "", 501);
    c.add(closeOut.root);

    this.modalRefresh = () => {
      const can = G.canPrestige();
      info.setText(
        `Best drink: ${DRINK_NAMES[G.S.bestTierRun]}\nRun score: ${fmt(G.S.runScore)}\n` +
          (can ? `Close out for ⭐ ${fmt(G.prestigeTokens())} + a boon` : `Reach ${DRINK_NAMES[PRESTIGE.tierGate]} to call last orders`),
      );
      this.setBtnEnabled(closeOut, can);
      this.paintButton(closeOut, can ? C.amber : C.disabled, can);
      refreshers.forEach((f) => f());
    };
    this.modalRefresh();
  }

  // roguelike boon draft — pick 1 of N, then the run resets
  private showDraft() {
    if (!G.canPrestige()) return;
    const c = this.openModal(false);
    const top = 300 + G.T.safeTop;
    const bottom = DESIGN.h - 260;
    this.drawPanel(c, top, bottom, "Pick a Boon");
    c.add(this.text(CENTER_X, top + 170, `Earned ⭐ ${fmt(G.prestigeTokens())} — choose one to keep forever`, 30, CREAM).setOrigin(0.5));

    const picks = G.draftBoons();
    const startY = top + 300;
    const spacing = 190;
    picks.forEach((b, i) => {
      const y = startY + spacing * i;
      const card = this.makeButton(
        CENTER_X,
        y,
        DESIGN.w - 360,
        150,
        b.name,
        42,
        () => {
          G.doPrestige(b.id);
          this.closeModal();
          this.flash(`${b.name} acquired!`);
        },
        C.teal,
        "",
        501,
      );
      card.sub?.setText(b.desc).setColor("#d6f4ff");
      c.add(card.root);
    });
  }

  private showWelcomeBack() {
    const c = this.openModal(false);
    const top = DESIGN.h * 0.34;
    const bottom = DESIGN.h * 0.66;
    this.drawPanel(c, top, bottom, "Welcome Back");
    c.add(
      this.text(CENTER_X, (top + bottom) / 2 - 10, `Your bar ran for ${fmtDuration(G.T.offlineSeconds)}\nand earned 💰 ${fmt(G.T.offlineEarned)}`, 36, CREAM)
        .setOrigin(0.5)
        .setAlign("center")
        .setLineSpacing(16),
    );
    const ok = this.makeButton(CENTER_X, bottom - 100, 380, 118, "Cheers!", 40, () => this.closeModal(), C.green, undefined, 501);
    c.add(ok.root);
    G.T.offlineEarned = 0;
  }

  private flash(msg: string) {
    const t = this.text(CENTER_X, DESIGN.h * 0.5, msg, 54, GOLD).setOrigin(0.5).setDepth(600);
    this.tweens.add({ targets: t, y: t.y - 130, alpha: 0, duration: 1500, ease: "Cubic.out", onComplete: () => t.destroy() });
  }
}
