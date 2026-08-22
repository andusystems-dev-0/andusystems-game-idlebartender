import Phaser from "phaser";
import { AnduGames } from "@andusystems/games-sdk";

// Per-game/per-env config comes from Vite env (.env.uat / .env.prod). gameId matches the registry slug.
const gameId = import.meta.env.VITE_GAME_ID ?? "idlebartender";
const env = import.meta.env.VITE_ENV ?? "dev";
const baseUrl = import.meta.env.VITE_API_BASE;

// The persisted save blob: only the cross-round scoreboard tally. The in-progress board is transient.
// Version the blob so future formats can be migrated (see SDK: opaque blobs, game owns the schema).
interface SaveState {
  wins: number;
  losses: number;
  draws: number;
  formatVersion: 1;
}

type Cell = "X" | "O" | "";
type Player = "X" | "O";
type Phase = "playing" | "over";

const HUMAN: Player = "X";
const AI: Player = "O";

// All 8 winning lines as index triples into the flat 9-cell board.
const LINES: readonly [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

// Palette — clean, high-contrast, mobile-first on a dark navy background.
const COLORS = {
  bg: "#0b1e3f",
  grid: 0x2a4a7f,
  x: "#3ad1ff",
  xHex: 0x3ad1ff,
  o: "#ff8a5c",
  oHex: 0xff8a5c,
  win: 0x4ade80,
  faint: "#6f86ad",
  text: "#e8f0ff",
} as const;

let games: AnduGames;
let state: SaveState = { wins: 0, losses: 0, draws: 0, formatVersion: 1 };

class MainScene extends Phaser.Scene {
  private board: Cell[] = ["", "", "", "", "", "", "", "", ""];
  private phase: Phase = "playing";
  private winningLine: [number, number, number] | null = null;
  private aiThinking = false;

  // Layout metrics, recomputed on every resize.
  private cellSize = 0;
  private boardX = 0;
  private boardY = 0;

  // Layers so we can redraw the board independently of the static chrome.
  private gridGfx!: Phaser.GameObjects.Graphics;
  private markGfx!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;

  constructor() {
    super("main");
  }

  async create() {
    this.gridGfx = this.add.graphics();
    this.markGfx = this.add.graphics();

    this.titleText = this.add.text(0, 0, "Tic-Tac-Toe", {
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontStyle: "bold",
      fontSize: "32px",
      color: COLORS.x,
    }).setOrigin(0.5);

    this.scoreText = this.add.text(0, 0, "", {
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "18px",
      color: COLORS.text,
      align: "center",
    }).setOrigin(0.5);

    this.statusText = this.add.text(0, 0, "Your move — you are X", {
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontStyle: "bold",
      fontSize: "24px",
      color: COLORS.text,
    }).setOrigin(0.5);

    this.hintText = this.add.text(0, 0, "Tap a square to place your X", {
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "15px",
      color: COLORS.faint,
    }).setOrigin(0.5);

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onPointer(p));
    this.scale.on("resize", () => this.layout());

    // Draw the board IMMEDIATELY — rendering must never be gated on the SDK or network.
    this.layout();

    // Restore the scoreboard in the background. Local-first + resilient: a slow, hanging,
    // or failed load (e.g. no backend reachable) must never blank the game.
    try {
      const loaded = (await games.load()) as Partial<SaveState> | null;
      if (loaded && typeof loaded.wins === "number" && typeof loaded.losses === "number" && typeof loaded.draws === "number") {
        state = { wins: loaded.wins, losses: loaded.losses, draws: loaded.draws, formatVersion: 1 };
        this.updateScore();
      }
    } catch {
      /* local-first — ignore load failures; the board is already up */
    }
  }

  // ---- Input -------------------------------------------------------------

  private onPointer(pointer: Phaser.Input.Pointer) {
    if (this.phase === "over") {
      this.resetBoard();
      return;
    }
    if (this.aiThinking) return;

    const idx = this.cellAt(pointer.x, pointer.y);
    if (idx < 0 || this.board[idx] !== "") return;

    this.board[idx] = HUMAN;
    if (this.settle()) return; // human just won or filled the board
    this.playAI();
  }

  private cellAt(x: number, y: number): number {
    const col = Math.floor((x - this.boardX) / this.cellSize);
    const row = Math.floor((y - this.boardY) / this.cellSize);
    if (col < 0 || col > 2 || row < 0 || row > 2) return -1;
    return row * 3 + col;
  }

  // ---- Game flow ---------------------------------------------------------

  /** Apply win/draw detection after a move. Returns true if the round ended. */
  private settle(): boolean {
    const line = this.findWin(this.board);
    if (line) {
      this.winningLine = line;
      const winner = this.board[line[0]] as Player;
      this.endRound(winner === HUMAN ? "win" : "loss");
      return true;
    }
    if (this.isFull(this.board)) {
      this.endRound("draw");
      return true;
    }
    this.drawBoard();
    return false;
  }

  private playAI() {
    this.aiThinking = true;
    this.statusText.setText("O is thinking…");
    this.drawBoard();
    // Small delay so the AI move feels deliberate rather than instant.
    this.time.delayedCall(420, () => {
      const move = this.chooseAIMove();
      if (move >= 0) this.board[move] = AI;
      this.aiThinking = false;
      if (!this.settle()) {
        this.statusText.setText("Your move — you are X");
      }
    });
  }

  private endRound(result: "win" | "loss" | "draw") {
    this.phase = "over";
    if (result === "win") state.wins += 1;
    else if (result === "loss") state.losses += 1;
    else state.draws += 1;

    // Persist the updated scoreboard: local-first + debounced background sync via the SDK.
    void games.save(state);

    const msg = result === "win" ? "X wins!" : result === "loss" ? "O wins!" : "Draw";
    const color = result === "win" ? COLORS.x : result === "loss" ? COLORS.o : COLORS.text;
    this.statusText.setColor(color).setText(msg);
    this.hintText.setText("Tap to play again");
    this.drawBoard();
    this.updateScore();
  }

  private resetBoard() {
    this.board = ["", "", "", "", "", "", "", "", ""];
    this.phase = "playing";
    this.winningLine = null;
    this.aiThinking = false;
    this.statusText.setColor(COLORS.text).setText("Your move — you are X");
    this.hintText.setText("Tap a square to place your X");
    this.drawBoard();
  }

  // ---- AI ----------------------------------------------------------------
  // Simple heuristic ladder: win > block > center > corner > random.

  private chooseAIMove(): number {
    const empty = this.emptyCells(this.board);
    if (empty.length === 0) return -1;

    // 1. Win now if possible.
    const winning = this.findWinningMove(this.board, AI);
    if (winning >= 0) return winning;

    // 2. Block the human's imminent win.
    const block = this.findWinningMove(this.board, HUMAN);
    if (block >= 0) return block;

    // 3. Take the center.
    if (this.board[4] === "") return 4;

    // 4. Take a corner.
    const corners = [0, 2, 6, 8].filter((i) => this.board[i] === "");
    if (corners.length) return corners[Math.floor(Math.random() * corners.length)];

    // 5. Random remaining (an edge).
    return empty[Math.floor(Math.random() * empty.length)];
  }

  /** Index that completes a line for `player`, or -1. */
  private findWinningMove(board: Cell[], player: Player): number {
    for (const [a, b, c] of LINES) {
      const trio = [board[a], board[b], board[c]];
      const marks = trio.filter((v) => v === player).length;
      const blanks = trio.filter((v) => v === "").length;
      if (marks === 2 && blanks === 1) {
        if (board[a] === "") return a;
        if (board[b] === "") return b;
        return c;
      }
    }
    return -1;
  }

  // ---- Board predicates --------------------------------------------------

  private findWin(board: Cell[]): [number, number, number] | null {
    for (const line of LINES) {
      const [a, b, c] = line;
      if (board[a] !== "" && board[a] === board[b] && board[b] === board[c]) return line;
    }
    return null;
  }

  private isFull(board: Cell[]): boolean {
    return board.every((c) => c !== "");
  }

  private emptyCells(board: Cell[]): number[] {
    const out: number[] = [];
    for (let i = 0; i < 9; i++) if (board[i] === "") out.push(i);
    return out;
  }

  // ---- Rendering ---------------------------------------------------------

  /** Recompute board geometry + reposition chrome, then repaint. Called on resize + boot. */
  private layout() {
    const { width, height } = this.scale;

    // The board is a square that fits the narrower axis with padding, biased toward the
    // upper-middle so the scoreboard/status have room on a tall portrait screen.
    const side = Math.min(width * 0.86, height * 0.6);
    this.cellSize = side / 3;
    this.boardX = (width - side) / 2;
    this.boardY = height * 0.30;

    this.titleText.setPosition(width / 2, height * 0.09);
    this.scoreText.setPosition(width / 2, height * 0.17);
    this.statusText.setPosition(width / 2, this.boardY - side * 0.14);
    this.hintText.setPosition(width / 2, this.boardY + side + Math.min(60, height * 0.08));

    // Scale text a touch on very small screens.
    const s = Phaser.Math.Clamp(side / 320, 0.75, 1.4);
    this.titleText.setFontSize(Math.round(32 * s));
    this.statusText.setFontSize(Math.round(24 * s));
    this.scoreText.setFontSize(Math.round(18 * s));
    this.hintText.setFontSize(Math.round(15 * s));

    this.updateScore();
    this.drawBoard();
  }

  private updateScore() {
    this.scoreText.setText(`Wins ${state.wins}   •   Losses ${state.losses}   •   Draws ${state.draws}`);
  }

  private drawBoard() {
    const g = this.gridGfx;
    const size = this.cellSize;
    const side = size * 3;
    const x0 = this.boardX;
    const y0 = this.boardY;

    g.clear();
    // Rounded backing panel.
    g.fillStyle(0x102a54, 1);
    g.fillRoundedRect(x0 - 8, y0 - 8, side + 16, side + 16, 16);

    // Grid lines (interior only, rounded caps look tidy at this weight).
    g.lineStyle(6, COLORS.grid, 1);
    for (let i = 1; i < 3; i++) {
      g.lineBetween(x0 + i * size, y0 + 8, x0 + i * size, y0 + side - 8);
      g.lineBetween(x0 + 8, y0 + i * size, x0 + side - 8, y0 + i * size);
    }

    this.drawMarks();
  }

  private drawMarks() {
    const m = this.markGfx;
    const size = this.cellSize;
    const x0 = this.boardX;
    const y0 = this.boardY;
    const pad = size * 0.24;
    m.clear();

    for (let i = 0; i < 9; i++) {
      const cell = this.board[i];
      if (cell === "") continue;
      const row = Math.floor(i / 3);
      const col = i % 3;
      const cx = x0 + col * size + size / 2;
      const cy = y0 + row * size + size / 2;
      if (cell === "X") this.drawX(m, cx, cy, size / 2 - pad);
      else this.drawO(m, cx, cy, size / 2 - pad);
    }

    // Strike-through the winning line.
    if (this.winningLine) {
      const [a, , c] = this.winningLine;
      const ax = x0 + (a % 3) * size + size / 2;
      const ay = y0 + Math.floor(a / 3) * size + size / 2;
      const cxp = x0 + (c % 3) * size + size / 2;
      const cyp = y0 + Math.floor(c / 3) * size + size / 2;
      m.lineStyle(10, COLORS.win, 1);
      m.lineBetween(ax, ay, cxp, cyp);
    }
  }

  private drawX(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number) {
    g.lineStyle(Math.max(6, r * 0.22), COLORS.xHex, 1);
    g.lineBetween(cx - r, cy - r, cx + r, cy + r);
    g.lineBetween(cx + r, cy - r, cx - r, cy + r);
  }

  private drawO(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number) {
    g.lineStyle(Math.max(6, r * 0.22), COLORS.oHex, 1);
    g.strokeCircle(cx, cy, r);
  }
}

async function boot() {
  games = await AnduGames.init({ gameId, env, baseUrl });

  // Native lifecycle → flush. On web the SDK already flushes on visibilitychange/pagehide.
  const Capacitor = (globalThis as any).Capacitor;
  if (Capacitor?.Plugins?.App) {
    Capacitor.Plugins.App.addListener("appStateChange", (s: { isActive: boolean }) => {
      if (!s.isActive) void games.flush();
    });
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: COLORS.bg,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    scene: [MainScene],
  });
}

void boot();
