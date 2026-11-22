import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoSermons } from "@/lib/sermon/demo-data";
import { ConflictError } from "@/lib/sermon/service";
import type { D1Like, D1Prepared } from "@/server/env";
import { createD1Store } from "@/server/store";

const schema = readFileSync("migrations/0001_init.sql", "utf8");
const [example] = demoSermons();
if (!example) throw new Error("Expected a demo sermon.");
const seed = Array.from({ length: 257 }, (_, i) => ({ ...example, id: `sermon-${i}` }));

describe("D1 staff saves", () => {
  let sqlite: DatabaseSync;
  let store: ReturnType<typeof createD1Store>;
  let batches: Prepared[][];
  let beforeBatch: (() => void) | undefined;

  class Prepared implements D1Prepared {
    constructor(
      readonly sql: string,
      readonly values: SQLInputValue[] = [],
    ) {}

    bind(...values: SQLInputValue[]) {
      return new Prepared(this.sql, values);
    }

    async first<T>() {
      return (sqlite.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
    }

    async all<T>() {
      return { results: sqlite.prepare(this.sql).all(...this.values) as T[] };
    }

    async run() {
      return { meta: { changes: Number(sqlite.prepare(this.sql).run(...this.values).changes) } };
    }
  }

  beforeEach(() => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(schema);
    sqlite.exec("INSERT INTO app_meta VALUES ('seeded', '1'), ('revision', '1')");
    const insert = sqlite.prepare("INSERT INTO sermons VALUES (?, ?, ?, ?)");
    for (const sermon of seed) {
      insert.run(sermon.id, sermon.date, sermon.status, JSON.stringify(sermon));
    }
    batches = [];
    beforeBatch = undefined;
    const db: D1Like = {
      prepare: (sql) => new Prepared(sql),
      async batch(statements: Prepared[]) {
        batches.push(statements);
        beforeBatch?.();
        sqlite.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements) {
            expect(statement.values.length).toBeLessThanOrEqual(100);
            results.push(await statement.run());
          }
          sqlite.exec("COMMIT");
          return results;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
    };
    store = createD1Store(db);
  });

  afterEach(() => sqlite.close());

  it("writes only the edited sermon and bumps the revision", async () => {
    const current = await store.list();
    const [first, ...rest] = current.sermons;
    expect.assert(first);
    const edited = { ...first, title: "Edited sermon" };
    const saved = await store.save([edited, ...rest], current.revision);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0]?.[0]?.sql).toContain("INSERT INTO sermons");
    expect(batches[0]?.[0]?.values).toHaveLength(5);
    expect(saved.revision).toBe(2);
    expect(await store.list()).toEqual(saved);
    expect(saved.sermons.find(({ id }) => id === edited.id)).toEqual(edited);
    await expect(store.save(current.sermons, current.revision)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("applies adds, updates, and deletes in one compact batch", async () => {
    const current = await store.list();
    const added = { ...example, id: "new-sermon" };
    const updated = current.sermons.slice(130).map((sermon) => ({
      ...sermon,
      title: "Updated sermon",
      date: "2025-01-01",
      status: "draft" as const,
    }));
    const saved = await store.save([added, ...updated], current.revision);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(9); // Six upserts, two deletes, and the revision bump.
    expect(saved.revision).toBe(2);
    expect(await store.list()).toEqual(saved);
    const [firstUpdated] = updated;
    expect.assert(firstUpdated);
    expect(
      sqlite.prepare("SELECT date, status FROM sermons WHERE id = ?").get(firstUpdated.id),
    ).toEqual({ date: "2025-01-01", status: "draft" });
  });

  it("guards every write when another save wins after the snapshot read", async () => {
    const current = await store.list();
    beforeBatch = () => sqlite.exec("UPDATE app_meta SET value = '2' WHERE key = 'revision'");
    const [first, , ...rest] = current.sermons;
    expect.assert(first);
    await expect(
      store.save([{ ...first, title: "Stale edit" }, { ...first, id: "stale-add" }, ...rest], 1),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(batches).toHaveLength(1);
    expect(await store.list()).toEqual({ sermons: current.sermons, revision: 2 });
  });
});
