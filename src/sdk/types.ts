// Vendored from andusystems-games-sdk@0.1.0 (src/types.ts). The SDK is public but not on npm; games
// bundle it. Kept verbatim except import extensions (dropped for Vite). Re-vendor to update.
export type Env = "prod" | "uat" | "dev";

/** Pluggable local storage. Web uses localStorage; native apps inject a Capacitor-backed driver. */
export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface InitOptions {
  gameId: string;
  env?: Env;
  /** Override the resolved base URL (e.g. local dev). */
  baseUrl?: string;
  /** Inject a storage driver (defaults: localStorage in the browser, in-memory elsewhere). */
  storage?: Storage;
  /** Stable device id; generated + persisted if omitted. */
  deviceId?: string;
  platform?: "web" | "ios" | "android";
  /** Debounce window for background sync (ms). */
  syncDebounceMs?: number;
  /** Conflict resolver for reject_stale games. Return the value to keep. */
  onConflict?: (local: unknown, server: unknown) => unknown;
}

export interface SaveResult {
  slot: string;
  version: number;
  etag: string;
}

export interface SlotInfo {
  slot: string;
  version: number;
  etag: string;
  size_bytes: number;
  updated_at: string;
}

export interface Entitlement {
  product_id: string;
  status: string;
  expires_at?: string | null;
}
