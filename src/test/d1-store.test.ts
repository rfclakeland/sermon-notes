import { afterEach, beforeEach, expect, it } from "vitest";
import { ConflictError } from "@/lib/sermon/service";
import { validateSermon } from "@/lib/sermon/validate";
import { createD1Store, type SermonStore } from "@/server/store";
import { createSQLiteD1 } from "./helpers/sqlite-d1";

const seedRevision = 7;
const archive = validateSermon({
  id: "paid-in-full",
  title: "Archive example",
  date: "2038-01-09",
  status: "draft",
});
const builder = validateSermon({
  id: "builder-00000000-0000-0000-0000-000000000001-2038-01-10",
  title: "Builder example",
  date: "2038-01-10",
  status: "published",
  content: { ops: [{ insert: "Example notes\n" }] },
});
let sqlite: ReturnType<typeof createSQLiteD1>;
let store: SermonStore;

beforeEach(() => {
  sqlite = createSQLiteD1(seedRevision);
  store = createD1Store(sqlite.db);
});

afterEach(() => sqlite.close());

it("lists the recorded revision even when there are no sermons", async () => {
  expect(await store.list()).toEqual({ sermons: [], revision: seedRevision });
});

it("leaves rows and revision untouched when a whole-collection save conflicts", async () => {
  const saved = await store.save([archive], seedRevision);
  await expect(store.save([builder], seedRevision)).rejects.toBeInstanceOf(ConflictError);
  expect(await store.list()).toEqual(saved);
});

it("inserts one sermon, keeps existing rows, and bumps the revision in the same batch", async () => {
  const saved = await store.save([archive], seedRevision);
  await store.insert(builder, saved.revision);
  const published = { sermons: [builder, archive], revision: saved.revision + 1 };
  expect(await store.list()).toEqual(published);

  await expect(store.save(saved.sermons, saved.revision)).rejects.toBeInstanceOf(ConflictError);
  expect(await store.list()).toEqual(published);
});

it.each([
  ["id", { ...builder, id: archive.id }],
  ["date", { ...builder, date: archive.date }],
] as const)(
  "leaves rows and revision untouched if the %s is already used",
  async (_field, sermon) => {
    const saved = await store.save([archive], seedRevision);
    await expect(store.insert(sermon, saved.revision)).rejects.toBeInstanceOf(ConflictError);
    expect(await store.list()).toEqual(saved);
  },
);

it("rejects a publish when a staff save bumps the revision after the publish read", async () => {
  const snapshot = await store.list();
  const staff = createD1Store(sqlite.db);
  const saved = await staff.save([archive], snapshot.revision);

  await expect(store.insert(builder, snapshot.revision)).rejects.toBeInstanceOf(ConflictError);
  expect(await store.list()).toEqual(saved);
  await store.insert(builder, saved.revision);
  expect(await store.list()).toEqual({ sermons: [builder, archive], revision: saved.revision + 1 });
});
