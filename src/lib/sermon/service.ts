import { demoSermons } from "./demo-data";
import { createHttpSermonService } from "./http-service";
import type { Sermon, SermonCollection } from "./types";
import { sortNewestFirst, validateCollection } from "./validate";

export class ConflictError extends Error {
  constructor() {
    super("The sermon collection changed since you opened it.");
    this.name = "ConflictError";
  }
}

/**
 * Adapter boundary. The UI only talks to this interface. Production swaps in
 * `createHttpSermonService()` (see http-service.ts) that calls the Cloudflare
 * Worker endpoints; the prototype uses the explicit local demo adapter below.
 */
export interface SermonService {
  readonly kind: "local-demo" | "http";
  list(): Promise<SermonCollection>;
  /** Saves the whole collection; throws ConflictError when `revision` is stale (HTTP 409). */
  save(sermons: Sermon[], revision: number): Promise<SermonCollection>;
  /** Receives an already-resized JPEG. */
  uploadCover(jpeg: Blob): Promise<{ cover: string }>;
  login(password: string): Promise<boolean>;
  session(): Promise<{ authenticated: boolean }>;
  logout(): Promise<void>;
}

const COLLECTION_KEY = "rfn-demo-collection-v1";
const SESSION_KEY = "rfn-demo-admin-session";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Toggles for exercising error states in the prototype. */
export const demoControls = { failNextSave: false };

function readLocal(): SermonCollection {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(COLLECTION_KEY);
      if (raw) {
        const c = validateCollection(JSON.parse(raw));
        return { sermons: sortNewestFirst(c.sermons), revision: c.revision };
      }
    } catch {
      /* fall back to seed */
    }
  }
  return { sermons: sortNewestFirst(demoSermons()), revision: 1 };
}

function writeLocal(c: SermonCollection) {
  try {
    window.localStorage.setItem(COLLECTION_KEY, JSON.stringify(c));
  } catch {
    throw new Error(
      "This browser could not store the demo collection (storage may be full). Try a smaller cover image.",
    );
  }
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the image."));
    r.readAsDataURL(b);
  });

export const localDemoService: SermonService & {
  simulateEditElsewhere(): void;
  resetDemo(): void;
} = {
  kind: "local-demo",
  async list() {
    await delay(250);
    return readLocal();
  },
  async save(sermons, revision) {
    await delay(550);
    if (demoControls.failNextSave) {
      demoControls.failNextSave = false;
      throw new Error("Simulated network error. Nothing was saved.");
    }
    const current = readLocal();
    if (revision !== current.revision) throw new ConflictError();
    const next = { sermons: sortNewestFirst(sermons), revision: current.revision + 1 };
    writeLocal(next);
    return next;
  },
  async uploadCover(jpeg) {
    await delay(300);
    // Demo only: data URL kept in this browser. Production: POST /api/covers → R2.
    return { cover: await blobToDataUrl(jpeg) };
  },
  async login() {
    await delay(300);
    window.sessionStorage.setItem(SESSION_KEY, "demo");
    return true;
  },
  async session() {
    if (typeof window === "undefined") return { authenticated: false };
    return { authenticated: window.sessionStorage.getItem(SESSION_KEY) === "demo" };
  },
  async logout() {
    window.sessionStorage.removeItem(SESSION_KEY);
  },
  simulateEditElsewhere() {
    const c = readLocal();
    writeLocal({ ...c, revision: c.revision + 1 });
  },
  resetDemo() {
    window.localStorage.removeItem(COLLECTION_KEY);
  },
};

/** Production adapter. The UI does not use the local demo service. */
export const sermonService: SermonService = createHttpSermonService();
