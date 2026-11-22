import { demoSermons } from "@/lib/sermon/demo-data";
import { ConflictError } from "@/lib/sermon/service";
import type { Sermon, SermonCollection } from "@/lib/sermon/types";
import { sortNewestFirst, validateCollection } from "@/lib/sermon/validate";
import type { D1Like, R2Like, WorkerEnv } from "./env";

export interface SermonStore {
  list(): Promise<SermonCollection>;
  save(sermons: Sermon[], revision: number): Promise<SermonCollection>;
  insert(sermon: Sermon, revision: number): Promise<void>;
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
    async insert(sermon, revision) {
      if (
        revision !== state.revision ||
        state.sermons.some((existing) => existing.id === sermon.id || existing.date === sermon.date)
      ) {
        throw new ConflictError();
      }
      state.sermons = sortNewestFirst([...state.sermons, structuredClone(sermon)]);
      state.revision += 1;
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

export function storeFor(env: WorkerEnv): SermonStore {
  if (env.DB) return createD1Store(env.DB, env.COVERS);
  if (import.meta.env.DEV) return devMemoryStore();
  throw new Error("Database is not configured.");
}

type SermonRow = { payload: string | null; revision: string };
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
      const rows = await db
        .prepare(
          "SELECT sermons.payload, app_meta.value AS revision FROM app_meta LEFT JOIN sermons ON 1 = 1 WHERE app_meta.key = 'revision'",
        )
        .all<SermonRow>();
      const sermons = sortNewestFirst(
        rows.results.flatMap((row) =>
          row.payload === null ? [] : [JSON.parse(row.payload) as Sermon],
        ),
      );
      return validateCollection({ sermons, revision: Number(rows.results[0]?.revision ?? "1") });
    },
    async save(sermons, revision) {
      await ensureSeeded(db);
      const guard = "(SELECT value FROM app_meta WHERE key = 'revision') = ?";
      const expected = String(revision);
      const next = revision + 1;
      const sorted = sortNewestFirst(sermons);
      // D1 runs the batch atomically. Every statement checks the same old
      // revision, so a concurrent save can never delete or replace rows here.
      const results = await db.batch([
        db.prepare(`DELETE FROM sermons WHERE ${guard}`).bind(expected),
        ...sorted.map((sermon) =>
          db
            .prepare(
              `INSERT INTO sermons (id, date, status, payload) SELECT ?, ?, ?, ? WHERE ${guard}`,
            )
            .bind(sermon.id, sermon.date, sermon.status, JSON.stringify(sermon), expected),
        ),
        db
          .prepare("UPDATE app_meta SET value = ? WHERE key = 'revision' AND value = ?")
          .bind(String(next), expected),
      ]);
      if (results.at(-1)?.meta.changes !== 1) throw new ConflictError();
      return { sermons: sorted, revision: next };
    },
    async insert(sermon, revision) {
      await ensureSeeded(db);
      const expected = String(revision);
      const [inserted, bumped] = await db.batch([
        db
          .prepare(
            `INSERT INTO sermons (id, date, status, payload)
             SELECT ?, ?, ?, ?
             WHERE (SELECT value FROM app_meta WHERE key = 'revision') = ?
             AND NOT EXISTS (SELECT 1 FROM sermons WHERE id = ? OR date = ?)`,
          )
          .bind(
            sermon.id,
            sermon.date,
            sermon.status,
            JSON.stringify(sermon),
            expected,
            sermon.id,
            sermon.date,
          ),
        // Same transaction: bump only if this INSERT landed (row now exists under the old revision).
        db
          .prepare(
            "UPDATE app_meta SET value = ? WHERE key = 'revision' AND value = ? AND EXISTS (SELECT 1 FROM sermons WHERE id = ? AND payload = ?)",
          )
          .bind(String(revision + 1), expected, sermon.id, JSON.stringify(sermon)),
      ]);
      if (inserted?.meta.changes !== 1 || bumped?.meta.changes !== 1) throw new ConflictError();
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
