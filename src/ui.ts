// DOM/CSS overlay UI (HUD, shop, prestige, boon draft, welcome-back). Native DOM = crisp text, reliable
// taps (the canvas buttons had z-order hit-test issues), and easy safe-area handling. Reads/writes the
// same game state module as the Phaser scene.
import { UPGRADES, META, DRINK_NAMES, PRESTIGE } from "./config";
import * as G from "./state";
import { fmt, fmtDuration } from "./format";

type Attrs = Record<string, unknown>;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (attrs)
    for (const k in attrs) {
      const v = attrs[k];
      if (k === "class") e.className = String(v);
      else if (k === "html") e.innerHTML = String(v);
      else if (k === "text") e.textContent = String(v);
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else (e as unknown as Record<string, unknown>)[k] = v;
    }
  for (const c of kids) e.append(c);
  return e;
}

let modalRoot: HTMLElement;
let toastEl: HTMLElement;
let refreshFns: Array<() => void> = [];
let currentBackdrop: HTMLElement | null = null;

// HUD element refs
let coinsVal: HTMLElement, rateEl: HTMLElement, tokensVal: HTMLElement, scoreVal: HTMLElement, scoreSmall: HTMLElement;
let lastCallBtn: HTMLButtonElement, lastCallSub: HTMLElement;

export function initUI() {
  const ui = document.getElementById("ui")!;

  // ── HUD chips ──
  coinsVal = el("span", { id: "coinsVal" });
  rateEl = el("span", { class: "small", id: "rate" });
  const coins = el("div", { class: "chip", id: "coins" }, coinsVal, rateEl);

  scoreVal = el("span", { id: "scoreVal" });
  scoreSmall = el("span", { class: "small", id: "scoreSmall" });
  const score = el("div", { class: "chip", id: "score" }, scoreVal, scoreSmall);

  tokensVal = el("span", { id: "tokensVal" });
  const tokens = el("div", { class: "chip", id: "tokens" }, tokensVal);

  ui.append(el("div", { id: "hud" }, coins, score, tokens));

  // ── HUD buttons ──
  const shopBtn = el("button", { class: "btn teal", onclick: openShop }, "Shop") as HTMLButtonElement;
  lastCallSub = el("span", { class: "sub" });
  lastCallBtn = el("button", { class: "btn purple", onclick: openPrestige }, "Last Call", lastCallSub) as HTMLButtonElement;
  ui.append(el("div", { id: "hud-buttons" }, shopBtn, lastCallBtn));

  // Cloud-save button (backup code / restore), tucked under the HUD.
  ui.append(el("button", { class: "iconbtn", id: "cloudBtn", onclick: openCloud, "aria-label": "Cloud save" }, "☁"));
  G.bus.on("cloudRestored", () => toast("Progress restored ☁"));

  modalRoot = el("div", { id: "modal-root" });
  toastEl = el("div", { id: "toast" });
  ui.append(modalRoot, toastEl);

  // Stop UI pointer events from bubbling to window, where Phaser's input listeners would otherwise see
  // them and wedge its pointer state (a "down" on a UI control with no matching "up" on the canvas) —
  // which was breaking flicking after opening/closing a menu. Canvas events go through #game, not #ui,
  // so flicks are unaffected.
  ["pointerdown", "pointerup", "pointermove", "touchstart", "touchend", "mousedown", "mouseup"].forEach((ev) =>
    ui.addEventListener(ev, (e) => e.stopPropagation()),
  );

  if (G.T.offlineEarned > 0) showWelcomeBanner(ui);

  requestAnimationFrame(loop);
}

// Non-blocking welcome-back banner (does NOT set modalOpen, so it never blocks flicking).
function showWelcomeBanner(ui: HTMLElement) {
  const b = el(
    "div",
    { class: "banner", html: `Welcome back — earned <b>💰 ${fmt(G.T.offlineEarned)}</b> in ${fmtDuration(G.T.offlineSeconds)}` },
  );
  b.addEventListener("pointerup", () => b.remove());
  ui.append(b);
  setTimeout(() => b.remove(), 7000);
  G.T.offlineEarned = 0;
}

function loop() {
  const now = performance.now();
  coinsVal.textContent = `💰 ${fmt(G.S.coins)}`;
  const r = G.idleCoinsPerSec();
  rateEl.textContent = r > 0 ? `+${fmt(r)}/s` : "";
  rateEl.style.display = r > 0 ? "block" : "none";
  tokensVal.textContent = `⭐ ${fmt(G.S.prestige.tokens)}`;

  const score = document.getElementById("score")!;
  if (G.comboActive(now)) {
    score.classList.add("combo");
    scoreVal.textContent = `x${G.comboMult(now).toFixed(1)}`;
    scoreSmall.textContent = `🔥 ${G.T.comboCount}`;
    scoreSmall.style.display = "block";
  } else {
    score.classList.remove("combo");
    scoreVal.textContent = fmt(G.S.runScore);
    scoreSmall.style.display = "none";
  }

  const can = G.canPrestige();
  lastCallBtn.disabled = !can;
  lastCallSub.textContent = can ? `⭐ +${fmt(G.prestigeTokens())}` : `reach ${DRINK_NAMES[PRESTIGE.tierGate]}`;

  for (const f of refreshFns) f();
  requestAnimationFrame(loop);
}

// ── modal framework ──────────────────────────────────────────────────────────
function openModal(build: (card: HTMLElement) => void, opts: { closeButton?: boolean; backdropClose?: boolean } = {}) {
  closeModal();
  G.T.modalOpen = true;
  const card = el("div", { class: "card" });
  const wrap = el("div", { class: "card-wrap" }, card);
  wrap.style.width = "min(560px, 94vw)";
  wrap.style.position = "relative";
  if (opts.closeButton !== false) {
    wrap.append(el("button", { class: "x", onclick: closeModal }, "✕"));
  }
  const backdrop = el("div", { class: "backdrop" }, wrap);
  if (opts.backdropClose !== false) {
    backdrop.addEventListener("pointerup", (e) => {
      if (e.target === backdrop) closeModal();
    });
  }
  modalRoot.append(backdrop);
  currentBackdrop = backdrop;
  build(card);
}

function closeModal() {
  refreshFns = [];
  currentBackdrop?.remove();
  currentBackdrop = null;
  G.T.modalOpen = false;
  G.bus.emit("uiClosed"); // let the scene clear any stray drag state
}

function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.style.transition = "none";
  toastEl.style.top = "46%";
  toastEl.style.opacity = "1";
  requestAnimationFrame(() => {
    toastEl.style.transition = "opacity 0.9s ease, top 0.9s ease";
    toastEl.style.top = "34%";
    toastEl.style.opacity = "0";
  });
}

// ── cloud save (backup code + restore) ────────────────────────────────────────
function openCloud() {
  openModal((card) => {
    card.append(el("h2", {}, "Cloud Save"));
    const status = el("div", { class: "sub-h" });
    card.append(status);
    refreshFns.push(() => {
      status.textContent = G.cloudOnline()
        ? "Auto-backed up to the cloud ✓"
        : "Saved on this device — cloud sync will resume when online";
    });

    card.append(el("div", { class: "section" }, "YOUR BACKUP CODE"));
    card.append(
      el("div", { class: "center-msg" }, "Keep this code. On a new phone or after reinstalling, paste it under Restore to get your progress back."),
    );
    const codeInput = el("input", { class: "codefield", readOnly: true, value: G.getBackupCode() }) as HTMLInputElement;
    const copyBtn = el(
      "button",
      {
        class: "buy ok",
        onclick: async () => {
          const code = G.getBackupCode();
          try {
            await navigator.clipboard.writeText(code);
          } catch {
            codeInput.focus();
            codeInput.select();
            try {
              (document as unknown as { execCommand?: (c: string) => void }).execCommand?.("copy");
            } catch {
              /* clipboard blocked — the field is selected for manual copy */
            }
          }
          toast("Backup code copied");
        },
      },
      "Copy",
    ) as HTMLButtonElement;
    card.append(el("div", { class: "row" }, codeInput, copyBtn));

    card.append(el("div", { class: "section" }, "RESTORE FROM A CODE"));
    const restoreInput = el("input", { class: "codefield", placeholder: "paste a backup code" }) as HTMLInputElement;
    const restoreBtn = el(
      "button",
      {
        class: "buy no",
        onclick: () => {
          const code = restoreInput.value.trim();
          if (!code) return;
          if (code === G.getBackupCode()) {
            toast("That's already this device");
            return;
          }
          if (confirm("Replace this device's progress with the backup for that code? This can't be undone.")) {
            G.restoreFromCode(code);
          }
        },
      },
      "Restore",
    ) as HTMLButtonElement;
    card.append(el("div", { class: "row" }, restoreInput, restoreBtn));
  });
}

// ── shop ─────────────────────────────────────────────────────────────────────
function openShop() {
  openModal((card) => {
    card.append(el("h2", {}, "The Back Bar"));
    for (const u of UPGRADES) {
      const lvlEl = el("div", { class: "lvl" });
      const buy = el("button", { class: "buy", onclick: () => G.buyUpgrade(u.id) }) as HTMLButtonElement;
      card.append(
        el(
          "div",
          { class: "row" },
          el("div", { class: "info" }, el("div", { class: "name" }, u.name), el("div", { class: "desc" }, u.desc), lvlEl),
          buy,
        ),
      );
      refreshFns.push(() => {
        const maxed = G.upgradeMaxed(u.id);
        lvlEl.textContent = `Lv ${G.lvl(u.id)} / ${u.max}`;
        const cost = G.upgradeCost(u.id);
        const afford = !maxed && G.S.coins >= cost;
        buy.className = "buy " + (maxed ? "max" : afford ? "ok" : "no");
        buy.disabled = maxed || !afford;
        buy.innerHTML = maxed ? "MAX" : `Buy<span class="cost">💰 ${fmt(cost)}</span>`;
      });
    }
  });
}

// ── prestige ──────────────────────────────────────────────────────────────────
function openPrestige() {
  openModal((card) => {
    card.append(el("h2", {}, "Last Call"));
    const msg = el("div", { class: "center-msg" });
    card.append(msg);

    card.append(el("div", { class: "section" }, "LEGACY — PERMANENT (SPEND ⭐)"));
    for (const m of META) {
      const lvlEl = el("div", { class: "lvl" });
      const buy = el("button", { class: "buy tok", onclick: () => G.buyMeta(m.id) }) as HTMLButtonElement;
      card.append(
        el(
          "div",
          { class: "row" },
          el("div", { class: "info" }, el("div", { class: "name" }, m.name), el("div", { class: "desc" }, m.desc), lvlEl),
          buy,
        ),
      );
      refreshFns.push(() => {
        const maxed = G.metaMaxed(m.id);
        lvlEl.textContent = `Lv ${G.metaLvl(m.id)} / ${m.max}`;
        const cost = G.metaCost(m.id);
        const afford = !maxed && G.S.prestige.tokens >= cost;
        buy.className = "buy " + (maxed ? "max" : afford ? "tok" : "no");
        buy.disabled = maxed || !afford;
        buy.innerHTML = maxed ? "MAX" : `Unlock<span class="cost">⭐ ${fmt(cost)}</span>`;
      });
    }

    const closeOut = el("button", { class: "btn amber big", onclick: openDraft }, "Close Out the Night") as HTMLButtonElement;
    card.append(closeOut);

    refreshFns.push(() => {
      const can = G.canPrestige();
      msg.innerHTML =
        `Best drink: <b>${DRINK_NAMES[G.S.bestTierRun]}</b><br>Run score: <b>${fmt(G.S.runScore)}</b><br>` +
        (can ? `Close out for <b>⭐ ${fmt(G.prestigeTokens())}</b> + a boon` : `Reach <b>${DRINK_NAMES[PRESTIGE.tierGate]}</b> to call last orders`);
      closeOut.disabled = !can;
    });
  });
}

// roguelike boon draft — pick 1, then the run resets
function openDraft() {
  if (!G.canPrestige()) return;
  openModal(
    (card) => {
      card.append(el("h2", {}, "Pick a Boon"));
      card.append(el("div", { class: "center-msg" }, `Earned ⭐ ${fmt(G.prestigeTokens())} — choose one to keep forever`));
      for (const b of G.draftBoons()) {
        card.append(
          el(
            "button",
            {
              class: "boon",
              onclick: () => {
                G.doPrestige(b.id);
                closeModal();
                toast(`${b.name} acquired!`);
              },
            },
            el("div", { class: "bn" }, b.name),
            el("div", { class: "bd" }, b.desc),
          ),
        );
      }
    },
    { closeButton: false, backdropClose: false },
  );
}

