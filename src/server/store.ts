import { demoSermons } from "@/lib/sermon/demo-data";
import { ConflictError } from "@/lib/sermon/service";
import type { Sermon, SermonCollection } from "@/lib/sermon/types";
import { sortNewestFirst, validateCollection } from "@/lib/sermon/validate";
import type { D1Like, R2Like } from "./env";

export interface SermonStore {
  list(): Promise<SermonCollection>;
  save(sermons: Sermon[], revision: number): Promise<SermonCollection>;
  putCover(id: string, bytes: ArrayBuffer): Promise<void>;
  getCover(id: string): Promise<ArrayBuffer | null>;
}

type MemoryState = {
  sermons: Sermon[];
  revision: number;
  covers: Map<string, ArrayBuffer>;
};

export function createMemoryStore(seed = demoSermons()): SermonStore {
  const state: MemoryState = {
    sermons: sortNewestFirst(seed),
    revision: 1,
    covers: new Map(),
  };
  return {
    async list() {
      return { sermons: state.sermons.map((s) => structuredClone(s)), revision: state.revision };
    },
    async save(sermons, revision) {
      if (revision !== state.revision) throw new ConflictError();
      state.sermons = sortNewestFirst(sermons);
      state.revision += 1;
      return { sermons: state.sermons.map((s) => structuredClone(s)), revision: state.revision };
    },
    async putCover(id, bytes) {
      state.covers.set(id, bytes);
    },
    async getCover(id) {
      return state.covers.get(id) ?? null;
    },
  };
}

/** One process-local store for `vite dev`, which does not attach D1. */
let devStore: SermonStore | undefined;
export function devMemoryStore() {
  devStore ??= createMemoryStore();
  return devStore;
}

type SermonRow = { payload: string };
type MetaRow = { value: string };

let seeding: Promise<void> | undefined;

async function ensureSeeded(db: D1Like) {
  const existing = await db
    .prepare("SELECT value FROM app_meta WHERE key = 'seeded'")
    .first<MetaRow>();
  if (existing) return;
  if (!seeding) {
    seeding = (async () => {
      const again = await db
        .prepare("SELECT value FROM app_meta WHERE key = 'seeded'")
        .first<MetaRow>();
      if (again) return;
      const sermons = validateCollection({ sermons: demoSermons(), revision: 1 }).sermons;
      const statements = [
        ...sermons.map((sermon) =>
          db
            .prepare("INSERT INTO sermons (id, date, status, payload) VALUES (?, ?, ?, ?)")
            .bind(sermon.id, sermon.date, sermon.status, JSON.stringify(sermon)),
        ),
        db.prepare("INSERT INTO app_meta (key, value) VALUES ('revision', '1')"),
        db.prepare("INSERT INTO app_meta (key, value) VALUES ('seeded', '1')"),
      ];
      try {
        await db.batch(statements);
      } catch (error) {
        const seeded = await db
          .prepare("SELECT value FROM app_meta WHERE key = 'seeded'")
          .first<MetaRow>();
        if (!seeded) throw error;
      }
    })().finally(() => {
      seeding = undefined;
    });
  }
  await seeding;
}

export function createD1Store(db: D1Like, covers?: R2Like): SermonStore {
  return {
    async list() {
      await ensureSeeded(db);
      const rows = await db.prepare("SELECT payload FROM sermons").all<SermonRow>();
      const sermons = sortNewestFirst(rows.results.map((row) => JSON.parse(row.payload) as Sermon));
      const revisionRow = await db
        .prepare("SELECT value FROM app_meta WHERE key = 'revision'")
        .first<MetaRow>();
      const revision = Number(revisionRow?.value ?? "1");
      return validateCollection({ sermons, revision: Number.isFinite(revision) ? revision : 1 });
    },
    async save(sermons, revision) {
      await ensureSeeded(db);
      const current = await db
        .prepare("SELECT value FROM app_meta WHERE key = 'revision'")
        .first<MetaRow>();
      const currentRevision = Number(current?.value ?? "0");
      if (revision !== currentRevision) throw new ConflictError();
      const next = currentRevision + 1;
      const sorted = sortNewestFirst(sermons);
      await db.batch([
        db.prepare("DELETE FROM sermons"),
        ...sorted.map((sermon) =>
          db
            .prepare("INSERT INTO sermons (id, date, status, payload) VALUES (?, ?, ?, ?)")
            .bind(sermon.id, sermon.date, sermon.status, JSON.stringify(sermon)),
        ),
        db.prepare("UPDATE app_meta SET value = ? WHERE key = 'revision'").bind(String(next)),
      ]);
      return { sermons: sorted, revision: next };
    },
    async putCover(id, bytes) {
      if (!covers) throw new Error("Cover storage is not configured.");
      await covers.put(`covers/${id}`, bytes, { httpMetadata: { contentType: "image/jpeg" } });
    },
    async getCover(id) {
      if (!covers) return null;
      const object = await covers.get(`covers/${id}`);
      if (!object) return null;
      return object.arrayBuffer();
    },
  };
}
