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

type CollectionRow = { payload: string | null; revision: string };
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
  async function list() {
    await ensureSeeded(db);
    // Read the revision and rows from the same snapshot.
    const { results } = await db
      .prepare(
        "SELECT sermons.payload, app_meta.value AS revision FROM app_meta LEFT JOIN sermons ON 1 = 1 WHERE app_meta.key = 'revision'",
      )
      .all<CollectionRow>();
    const sermons = sortNewestFirst(
      results.flatMap(({ payload }) => (payload === null ? [] : [JSON.parse(payload) as Sermon])),
    );
    return validateCollection({ sermons, revision: Number(results[0]?.revision ?? "1") });
  }

  return {
    list,
    // codex/builder-publishing also guards this save atomically. Keep the incremental writes when merging.
    async save(sermons, revision) {
      const current = await list();
      if (revision !== current.revision) throw new ConflictError();

      const { sermons: validated } = validateCollection({ sermons, revision });
      const sorted = sortNewestFirst(validated);
      const previous = new Map(current.sermons.map((sermon) => [sermon.id, JSON.stringify(sermon)]));
      const writes = sorted.flatMap((sermon) => {
        const payload = JSON.stringify(sermon);
        const unchanged = previous.get(sermon.id) === payload;
        previous.delete(sermon.id);
        return unchanged ? [] : [[sermon.id, sermon.date, sermon.status, payload]];
      });
      const removed = [...previous.keys()];
      const expected = String(revision);
      const guard = "(SELECT value FROM app_meta WHERE key = 'revision') = ?";
      const statements = [];

      // Group bulk changes while staying within D1's 100 parameters per statement.
      const writeSize = 24; // Four parameters per row, plus the revision guard.
      for (let i = 0; i < writes.length; i += writeSize) {
        const rows = writes.slice(i, i + writeSize);
        const values = rows.map(() => "(?, ?, ?, ?)").join(", ");
        statements.push(
          db
            .prepare(
              `WITH changed(id, date, status, payload) AS (VALUES ${values})
               INSERT INTO sermons (id, date, status, payload)
               SELECT id, date, status, payload FROM changed WHERE ${guard}
               ON CONFLICT(id) DO UPDATE SET
                 date = excluded.date, status = excluded.status, payload = excluded.payload`,
            )
            .bind(...rows.flat(), expected),
        );
      }
      const deleteSize = 99;
      for (let i = 0; i < removed.length; i += deleteSize) {
        const ids = removed.slice(i, i + deleteSize);
        const placeholders = ids.map(() => "?").join(", ");
        statements.push(
          db
            .prepare(`DELETE FROM sermons WHERE id IN (${placeholders}) AND ${guard}`)
            .bind(...ids, expected),
        );
      }

      const next = revision + 1;
      const results = await db.batch([
        ...statements,
        db
          .prepare("UPDATE app_meta SET value = ? WHERE key = 'revision' AND value = ?")
          .bind(String(next), expected),
      ]);
      if (results.at(-1)?.meta.changes !== 1) throw new ConflictError();
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
