// Vendored from andusystems-games-sdk@0.1.0 (src/storage.ts).
import type { Storage } from "./types";

/** In-memory driver — used server-side / in tests, and as a fallback. */
export class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  async get(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  async set(k: string, v: string) {
    this.m.set(k, v);
  }
  async remove(k: string) {
    this.m.delete(k);
  }
}

/** localStorage driver for the browser (production target for larger blobs is IndexedDB). */
export class WebStorage implements Storage {
  async get(k: string) {
    return globalThis.localStorage.getItem(k);
  }
  async set(k: string, v: string) {
    globalThis.localStorage.setItem(k, v);
  }
  async remove(k: string) {
    globalThis.localStorage.removeItem(k);
  }
}

export function defaultStorage(): Storage {
  try {
    if (typeof globalThis.localStorage !== "undefined") return new WebStorage();
  } catch {
    /* access can throw in some sandboxes */
  }
  return new MemoryStorage();
}
