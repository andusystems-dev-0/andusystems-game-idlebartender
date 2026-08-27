// Vendored from andusystems-games-sdk@0.1.0 (src/client.ts). Kept verbatim except import extensions.
import type { Env, InitOptions, Storage, SaveResult, SlotInfo, Entitlement } from "./types";
import { defaultStorage } from "./storage";

const BASE_URLS: Record<Env, string> = {
  prod: "https://api.games.andusystems.com",
  uat: "https://uat-api.games.andusystems.com",
  dev: "http://localhost:8080",
};

function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  if (typeof (globalThis as any).Buffer !== "undefined") {
    return (globalThis as any).Buffer.from(bytes).toString("base64");
  }
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function b64decode(b64: string): string {
  if (typeof (globalThis as any).Buffer !== "undefined") {
    return (globalThis as any).Buffer.from(b64, "base64").toString("utf-8");
  }
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

interface LocalRecord {
  stateB64: string;
  version: number;
  etag?: string;
  dirty: boolean;
}

function isNative(): boolean {
  return typeof (globalThis as any).Capacitor !== "undefined";
}

/**
 * AnduGames — local-first save client. Writes to device storage synchronously, then syncs to the
 * save-api on a debounce and on app close/crash. The device is the source of truth.
 */
export class AnduGames {
  private gameId: string;
  private env: Env;
  private baseUrl: string;
  private storage: Storage;
  private platform: string;
  private syncDebounceMs: number;
  private onConflict?: (local: unknown, server: unknown) => unknown;

  private deviceId!: string;
  private token?: string;
  private dirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  private constructor(opts: InitOptions) {
    this.gameId = opts.gameId;
    this.env = opts.env ?? "prod";
    this.baseUrl = opts.baseUrl ?? BASE_URLS[this.env];
    this.storage = opts.storage ?? defaultStorage();
    this.platform = opts.platform ?? (isNative() ? "ios" : "web");
    this.syncDebounceMs = opts.syncDebounceMs ?? 3000;
    this.onConflict = opts.onConflict;
  }

  static async init(opts: InitOptions): Promise<AnduGames> {
    const g = new AnduGames(opts);
    g.deviceId = opts.deviceId ?? (await g.ensureDeviceId());
    // Do NOT block boot on the network — acquire the token in the BACKGROUND. The game renders
    // and saves/loads locally immediately; cloud sync begins once the token lands. (local-first)
    void g.ensureToken();
    g.installLifecycleHooks();
    return g;
  }

  /** The stable device id (also the account key — see restore code in the game). */
  getDeviceId(): string {
    return this.deviceId;
  }

  /** True once a token has been acquired (cloud reachable). */
  isOnline(): boolean {
    return !!this.token;
  }

  // ---- identity ----
  private async ensureDeviceId(): Promise<string> {
    const key = "andu:device_id";
    let id = await this.storage.get(key);
    if (!id) {
      id = (globalThis.crypto?.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await this.storage.set(key, id);
    }
    return id;
  }

  private async ensureToken(): Promise<void> {
    const key = `andu:${this.env}:token`;
    const cached = await this.storage.get(key);
    if (cached) {
      this.token = cached;
      return;
    }
    try {
      const res = await this.http("POST", "/v1/players", { device_id: this.deviceId, platform: this.platform });
      this.token = (res as any).token;
      await this.storage.set(key, this.token!);
    } catch {
      // Local-first: backend unreachable/slow — run OFFLINE. init() must never block or throw
      // on the network, or the game never boots. The token is acquired lazily on the next sync.
    }
  }

  // ---- saves (local-first) ----
  async save(state: unknown, opts: { slot?: string } = {}): Promise<void> {
    const slot = opts.slot ?? "default";
    const prev = await this.readLocal(slot);
    const rec: LocalRecord = {
      stateB64: b64encode(JSON.stringify(state)),
      version: prev?.version ?? 0,
      etag: prev?.etag,
      dirty: true,
    };
    await this.writeLocal(slot, rec);
    this.dirty.add(slot);
    this.scheduleSync();
  }

  async load(opts: { slot?: string } = {}): Promise<unknown | null> {
    const slot = opts.slot ?? "default";
    const local = await this.readLocal(slot);
    let server: { version: number; etag: string; blob: string } | null = null;
    try {
      if (!this.token) await this.ensureToken();
      server = (await this.http("GET", `/v1/games/${this.gameId}/saves/${slot}`)) as any;
    } catch {
      // Local-first: 404, network error, timeout, or offline all fall back to the local copy.
      server = null;
    }
    if (!server) return local ? JSON.parse(b64decode(local.stateB64)) : null;

    // Reconcile: server wins unless local is strictly newer (unsynced local edit).
    if (!local || server.version >= local.version) {
      await this.writeLocal(slot, { stateB64: server.blob, version: server.version, etag: server.etag, dirty: false });
      this.dirty.delete(slot);
      return JSON.parse(b64decode(server.blob));
    }
    return JSON.parse(b64decode(local.stateB64));
  }

  async list(): Promise<SlotInfo[]> {
    const res = (await this.http("GET", `/v1/games/${this.gameId}/saves`)) as any;
    return res.slots ?? [];
  }

  async delete(opts: { slot?: string } = {}): Promise<void> {
    const slot = opts.slot ?? "default";
    await this.storage.remove(this.localKey(slot));
    this.dirty.delete(slot);
    try {
      await this.http("DELETE", `/v1/games/${this.gameId}/saves/${slot}`);
    } catch (e: any) {
      if (e?.status !== 404) throw e;
    }
  }

  async history(opts: { slot?: string } = {}): Promise<Array<{ version: number; size_bytes: number; created_at: string }>> {
    const slot = opts.slot ?? "default";
    const res = (await this.http("GET", `/v1/games/${this.gameId}/saves/${slot}/history`)) as any;
    return res.versions ?? [];
  }

  // ---- sync ----
  private scheduleSync(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.syncDebounceMs);
  }

  /** Force-sync all dirty slots now (call on close/crash). */
  async flush(): Promise<void> {
    if (!this.token) await this.ensureToken();
    const slots = [...this.dirty];
    for (const slot of slots) await this.syncSlot(slot);
  }

  private async syncSlot(slot: string): Promise<void> {
    const rec = await this.readLocal(slot);
    if (!rec || !rec.dirty) {
      this.dirty.delete(slot);
      return;
    }
    const headers: Record<string, string> = {};
    if (rec.etag) headers["If-Match"] = rec.etag;
    try {
      const res = (await this.http("PUT", `/v1/games/${this.gameId}/saves/${slot}`, { blob: rec.stateB64 }, headers)) as SaveResult;
      await this.writeLocal(slot, { ...rec, version: res.version, etag: res.etag, dirty: false });
      this.dirty.delete(slot);
    } catch (e: any) {
      if (e?.status === 409 && e.body?.current) {
        const serverState = JSON.parse(b64decode(e.body.current.blob));
        const localState = JSON.parse(b64decode(rec.stateB64));
        const kept = this.onConflict ? this.onConflict(localState, serverState) : serverState; // default: server wins
        await this.writeLocal(slot, {
          stateB64: b64encode(JSON.stringify(kept)),
          version: e.body.current.version,
          etag: e.body.current.etag,
          dirty: kept !== serverState,
        });
        if (kept === serverState) this.dirty.delete(slot);
      }
      // transient errors: leave dirty, retry on next flush
    }
  }

  // ---- payments (web-first; app reads entitlements only) ----
  async entitlements(): Promise<Entitlement[]> {
    try {
      const res = (await this.http("GET", `/v1/games/${this.gameId}/entitlements`)) as any;
      return res.entitlements ?? [];
    } catch (e: any) {
      if (e?.status === 404) return []; // payments not enabled yet (Phase 7)
      throw e;
    }
  }

  /** Web only. On native, digital-goods checkout must use store IAP — guarded (store policy). */
  async checkoutUrl(productId: string, returnUrl?: string): Promise<string> {
    if (isNative()) {
      throw new Error("checkoutUrl is web-only; native digital purchases must use store IAP (see payments.md)");
    }
    const res = (await this.http("POST", "/v1/checkout", { product_id: productId, return_url: returnUrl })) as any;
    return res.url;
  }

  async linkAccount(opts: { method: "email" | "oauth"; email?: string }): Promise<void> {
    await this.http("POST", "/v1/players/link", opts);
  }

  // ---- helpers ----
  private localKey(slot: string): string {
    return `andu:${this.gameId}:save:${slot}`;
  }
  private async readLocal(slot: string): Promise<LocalRecord | null> {
    const raw = await this.storage.get(this.localKey(slot));
    return raw ? (JSON.parse(raw) as LocalRecord) : null;
  }
  private async writeLocal(slot: string, rec: LocalRecord): Promise<void> {
    await this.storage.set(this.localKey(slot), JSON.stringify(rec));
  }

  private installLifecycleHooks(): void {
    const doc: any = (globalThis as any).document;
    if (doc?.addEventListener) {
      doc.addEventListener("visibilitychange", () => {
        if (doc.visibilityState === "hidden") void this.flush();
      });
    }
    const win: any = globalThis as any;
    win.addEventListener?.("pagehide", () => void this.flush());
    // Native: the game wires Capacitor App 'pause'/'appStateChange' → flush() (see template).
  }

  private async http(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<unknown> {
    const headers: Record<string, string> = { ...extraHeaders };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    // Bound every request so an unreachable/hanging backend can't stall the caller (init/load).
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    const parsed = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err: any = new Error(`${method} ${path} → ${res.status}`);
      err.status = res.status;
      err.body = parsed;
      throw err;
    }
    return parsed;
  }
}
