import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SermonDocument } from "@/components/reader/SermonDocument";
import { ConflictError } from "@/lib/sermon/service";
import type { SermonCollection } from "@/lib/sermon/types";
import { validateSermon } from "@/lib/sermon/validate";
import { handleSave } from "@/server/api";
import { sessionCookie, signSession } from "@/server/auth";
import { handleBuilderPublish } from "@/server/builder-publish";
import { createMemoryStore, storeFor } from "@/server/store";

vi.mock(import("@/server/store"), async (importOriginal) => ({
  ...(await importOriginal()),
  storeFor: vi.fn(),
}));

const origin = "https://notes.example";
const endpoint = "https://untrusted-host.example/api/builder/publish";
const token = "synthetic-test-token";
const staffSecret = "synthetic-staff-secret";
const date = "2038-01-10";
const uuid = "0afce015-c76e-44ac-b7c6-25c5ff9a2f2d";
const idFor = (day: string) => `builder-${uuid}-${day}`;
const id = idFor(date);
const blank = { insert: { blank: { id: "b-1", answer: "blank", multiline: false } } };
const outline = {
  id,
  date,
  title: "Builder publication test",
  speaker: "Example speaker",
  scripture: "Mark 2:1–12",
  content: { ops: [{ insert: "An example " }, blank, { insert: "\n" }] },
};
const receipt = { id, url: `${origin}/sermons/${id}` };
const env = { BUILDER_PUBLISH_TOKEN: token, PUBLIC_ORIGIN: origin, AUTH_SECRET: staffSecret };
const byteLimit = 256 * 1024;
let store: ReturnType<typeof createMemoryStore>;

function request(body: BodyInit, overrides: Record<string, string | null> = {}) {
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  });
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) headers.delete(name);
    else headers.set(name, value);
  }
  const init: RequestInit & { duplex: "half" } = { method: "POST", headers, body, duplex: "half" };
  return new Request(endpoint, init);
}

async function publish(input: unknown = outline) {
  const response = await handleBuilderPublish(
    input instanceof Request ? input : request(JSON.stringify(input)),
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response;
}

function streamBody(chunks: Uint8Array[]) {
  const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
    const chunk = chunks.shift();
    if (chunk) controller.enqueue(chunk);
    else controller.close();
  });
  const cancel = vi.fn();
  const body = new ReadableStream({ pull, cancel }, { highWaterMark: 0 });
  return { body, pull, cancel };
}

async function saveAsStaff(collection: SermonCollection) {
  const url = `${origin}/api/sermons`;
  const cookie = sessionCookie(await signSession(staffSecret), new Request(url)).split(";")[0]!;
  return handleSave(
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(collection),
    }),
  );
}

function archiveSermon(day = date, status = "published") {
  return validateSermon({ id: "paid-in-full", date: day, title: "Archive example", status });
}

beforeEach(() => {
  store = createMemoryStore([]);
  vi.mocked(storeFor).mockReset().mockReturnValue(store);
  vi.stubGlobal("__env__", env);
  vi.stubEnv("BUILDER_PUBLISH_TOKEN", "");
  vi.stubEnv("PUBLIC_ORIGIN", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it.each(["BUILDER_PUBLISH_TOKEN", "PUBLIC_ORIGIN"] as const)(
  "returns 503 when %s is unset",
  async (name) => {
    vi.stubGlobal("__env__", { ...env, [name]: undefined });
    const stream = streamBody([]);
    const response = await publish(request(stream.body));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Publishing is not configured." });
    expect(stream.pull).not.toHaveBeenCalled();
    expect(storeFor).not.toHaveBeenCalled();
  },
);

it.each([
  "http://notes.example",
  "https://notes.example/sermons",
  "https://notes.example/a/..",
  "https://notes.example?",
  "https://notes.example#",
  "https://name@notes.example",
  "https://notes.example\n",
  "not an origin",
])("returns 503 for an invalid origin %j", async (value) => {
  vi.stubGlobal("__env__", { ...env, PUBLIC_ORIGIN: value });
  const response = await publish();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Publishing is not configured." });
  expect(storeFor).not.toHaveBeenCalled();
});

it("allows a configured http://localhost origin in development and tests", async () => {
  vi.stubGlobal("__env__", { ...env, PUBLIC_ORIGIN: "http://localhost:3000/" });
  const response = await publish();
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ id, url: `http://localhost:3000/sermons/${id}` });
});

it("rejects an http://localhost origin in production", async () => {
  vi.stubEnv("DEV", false);
  vi.stubEnv("MODE", "production");
  vi.stubGlobal("__env__", { ...env, PUBLIC_ORIGIN: "http://localhost:3000" });
  expect((await publish()).status).toBe(503);
});

it.each([null, "Basic token", "Bearer", `Bearer ${token} extra`, "Bearer wrong"])(
  "returns 401 before accessing the body for invalid authorization %j",
  async (authorization) => {
    const stream = streamBody([]);
    const incoming = request(stream.body, {
      authorization,
      "content-type": "text/plain",
      "content-length": String(byteLimit + 1),
    });
    expect((await publish(incoming)).status).toBe(401);
    expect(stream.pull).not.toHaveBeenCalled();
    expect(incoming.bodyUsed).toBe(false);
    expect(storeFor).not.toHaveBeenCalled();
  },
);

it.each([null, "text/plain", "application/json-patch+json"])(
  "rejects media type %j with 415",
  async (type) => {
    const stream = streamBody([]);
    expect((await publish(request(stream.body, { "content-type": type }))).status).toBe(415);
    expect(stream.pull).not.toHaveBeenCalled();
  },
);

it("rejects an oversized Content-Length before reading the stream", async () => {
  const stream = streamBody([]);
  const incoming = request(stream.body, { "content-length": String(byteLimit + 1) });
  expect((await publish(incoming)).status).toBe(413);
  expect(stream.pull).not.toHaveBeenCalled();
  expect(incoming.bodyUsed).toBe(false);
  expect(storeFor).not.toHaveBeenCalled();
});

it.each([null, "1"])(
  "caps streamed UTF-8 bytes with Content-Length %j and cancels the remaining body",
  async (length) => {
    const encoder = new TextEncoder();
    const prefix = `{"content":{"ops":[{"insert":"`;
    const stream = streamBody([
      encoder.encode(prefix + "é".repeat(96 * 1024)),
      encoder.encode("é".repeat(40 * 1024)),
      encoder.encode('"}]}}'),
    ]);
    const incoming = request(stream.body, { "content-length": length });
    expect((await publish(incoming)).status).toBe(413);
    expect(stream.pull).toHaveBeenCalledTimes(2);
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(storeFor).not.toHaveBeenCalled();
  },
);

it("accepts JSON with a charset and a UTF-8 character split across stream chunks", async () => {
  const text = JSON.stringify({ ...outline, title: "Café" });
  const encoded = new TextEncoder().encode(text);
  const splitAt = encoded.indexOf(0xc3) + 1;
  const stream = streamBody([encoded.subarray(0, splitAt), encoded.subarray(splitAt)]);
  const result = await publish(
    request(stream.body, {
      "content-type": "Application/JSON; charset=utf-8",
      "content-length": String(encoded.length),
    }),
  );
  expect(result.status).toBe(201);
  expect((await store.list()).sermons[0]?.title).toBe("Café");
});

it("returns 400 for malformed JSON", async () => {
  expect((await publish(request("{"))).status).toBe(400);
});

it.each([
  ["null body", null],
  ["array body", [outline]],
  ["primitive body", "notes"],
  ["missing date", { ...outline, date: undefined }],
  ["short date", { ...outline, date: "2038-1-10" }],
  ["February 30", { ...outline, date: "2038-02-30", id: idFor("2038-02-30") }],
  ["leap day in a non-leap year", { ...outline, date: "2100-02-29", id: idFor("2100-02-29") }],
  ["abbreviated UUID", { ...outline, id: `builder-0afce015-${date}` }],
  ["incorrect UUID shape", { ...outline, id: `builder-${"-".repeat(36)}-${date}` }],
  ["uppercase UUID", { ...outline, id: `builder-${uuid.toUpperCase()}-${date}` }],
  ["mismatched id date", { ...outline, id: idFor("2038-01-11") }],
  ["id with a trailing newline", { ...outline, id: `${id}\n` }],
  ["empty title", { ...outline, title: " \t " }],
  ["invisible title", { ...outline, title: "\u200b" }],
  ["missing content", { ...outline, content: undefined }],
  ["missing ops", { ...outline, content: {} }],
  ["empty ops", { ...outline, content: { ops: [] } }],
  ["invisible text", { ...outline, content: { ops: [{ insert: " \n\t\u200b" }] } }],
  ["blank without visible text", { ...outline, content: { ops: [blank] } }],
  ["too many ops", { ...outline, content: { ops: Array(5001).fill({ insert: "a" }) } }],
  ["duplicate blank ids", { ...outline, content: { ops: [{ insert: "Example" }, blank, blank] } }],
  ["non-string, non-blank insert", { ...outline, content: { ops: [{ insert: 25 }] } }],
])("returns 400 for %s", async (_name, payload) => {
  expect((await publish(payload)).status).toBe(400);
  expect(storeFor).not.toHaveBeenCalled();
});

it("accepts a real leap day", async () => {
  const leapDay = "2040-02-29";
  expect((await publish({ ...outline, date: leapDay, id: idFor(leapDay) })).status).toBe(201);
});

it.each([
  { image: "https://example.test/image.png" },
  { video: "https://example.test/video" },
  { formula: "1+1" },
  { ...blank.insert, image: "https://example.test/image.png" },
])("rejects an unsupported embed %j with 400", async (insert) => {
  const content = { ops: [{ insert: "Example" }, { insert }] };
  expect((await publish({ ...outline, content })).status).toBe(400);
});

it("strips unsupported attributes and renders HTML-looking text literally", async () => {
  const literal = '<script>example text</script><img src="example.png">';
  const attributes = { bold: true, link: "javascript:void(0)", unknown: "value" };
  const content = {
    ops: [
      { insert: literal, attributes },
      blank,
      { insert: "\n", attributes: { header: 1, unknown: "value" } },
    ],
  };
  expect((await publish({ ...outline, content })).status).toBe(201);
  const doc = (await store.list()).sermons[0]?.content;
  expect(doc?.ops).toEqual([
    { insert: literal, attributes: { bold: true } },
    blank,
    { insert: "\n", attributes: { header: 1 } },
  ]);
  const { container } = render(
    createElement(SermonDocument, { doc: doc!, values: {}, revealed: false, onChange: vi.fn() }),
  );
  expect(screen.getByText(literal)).toBeInTheDocument();
  expect(container.querySelector("a, img, script")).toBeNull();
  expect(screen.getByRole("textbox")).toBeInTheDocument();
});

it("only accepts Builder-owned fields and always publishes new sermons", async () => {
  const result = await publish({
    ...outline,
    cover: "data:image/png;base64,AAAA",
    series: "Example series",
    context: "Example context",
    lead: "Example lead",
    points: [{ answer: "Example point" }],
    reference: "Mark 3",
    status: "draft",
  });
  expect(result.status).toBe(201);
  expect((await store.list()).sermons).toEqual([
    { ...outline, status: "published", reference: "", context: "", lead: "", points: [] },
  ]);
});

it("uses PUBLIC_ORIGIN for the permanent receipt and leaves identical retries read-only", async () => {
  const created = await publish();
  expect(created.status).toBe(201);
  expect(await created.json()).toEqual(receipt);
  const beforeRetry = await store.list();
  const retry = await publish();
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual(receipt);
  expect(await store.list()).toEqual(beforeRetry);
});

it("compares normalized titles, fields, and ops", async () => {
  const formatted = {
    ...outline,
    title: "  Builder publication test  ",
    speaker: " Example speaker ",
    scripture: " Mark 2:1–12 ",
    content: { ops: outline.content.ops.slice(0, -1) },
  };
  expect((await publish(formatted)).status).toBe(201);
  expect((await publish()).status).toBe(200);
});

it("preserves staff additions on an identical retry", async () => {
  expect((await publish()).status).toBe(201);
  const collection = await store.list();
  const [published] = collection.sermons;
  const additions = {
    cover: "/covers/example.jpg",
    series: "Example series",
    context: "Example context",
    lead: "Example lead",
    points: [{ before: "A ", answer: "point", after: "." }],
    reference: "Mark 3",
  };
  expect(
    (await saveAsStaff({ ...collection, sermons: [{ ...published!, ...additions }] })).status,
  ).toBe(200);
  const beforeRetry = await store.list();
  const retry = await publish();
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual(receipt);
  expect(await store.list()).toEqual(beforeRetry);
});

it("returns id_conflict after staff edits the title or Builder sends different notes", async () => {
  expect((await publish()).status).toBe(201);
  const differentContent = { ...outline, content: { ops: [{ insert: "Changed notes\n" }] } };
  const different = await publish(differentContent);
  expect(different.status).toBe(409);
  expect(await different.json()).toMatchObject({ code: "id_conflict" });

  const collection = await store.list();
  const [published] = collection.sermons;
  expect(
    (await saveAsStaff({ ...collection, sermons: [{ ...published!, title: "Staff title" }] }))
      .status,
  ).toBe(200);
  const beforeRetry = await store.list();
  const retry = await publish();
  expect(retry.status).toBe(409);
  expect(await retry.json()).toMatchObject({ code: "id_conflict" });
  expect(await store.list()).toEqual(beforeRetry);
});

it.each(["published", "draft"])(
  "returns date_taken for an archive-style %s even with a different id",
  async (status) => {
    const before = await store.save([archiveSermon(date, status)], 1);
    const result = await publish();
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({ code: "date_taken" });
    expect(await store.list()).toEqual(before);
  },
);

it("rejects a staff save with the pre-publish revision and preserves both sermons", async () => {
  const archive = archiveSermon("2038-01-09");
  const stale = await store.save([archive], 1);
  expect((await publish()).status).toBe(201);
  expect((await saveAsStaff(stale)).status).toBe(409);
  const current = await store.list();
  expect(current.revision).toBe(stale.revision + 1);
  expect(current.sermons.map((sermon) => sermon.id)).toEqual([id, archive.id]);
});

it("re-reads after a concurrent staff save on an unrelated date and publishes", async () => {
  const insert = store.insert;
  const archive = archiveSermon("2038-01-09");
  const interleaved = vi.spyOn(store, "insert").mockImplementationOnce(async (sermon, revision) => {
    await store.save([archive], revision);
    await insert(sermon, revision);
  });
  expect((await publish()).status).toBe(201);
  expect(interleaved).toHaveBeenCalledTimes(2);
  expect((await store.list()).sermons.map((sermon) => sermon.id)).toEqual([id, archive.id]);
});

it("re-checks the date after a staff save and returns a permanent date conflict", async () => {
  const insert = store.insert;
  const interleaved = vi.spyOn(store, "insert").mockImplementationOnce(async (sermon, revision) => {
    await store.save([archiveSermon()], revision);
    await insert(sermon, revision);
  });
  const result = await publish();
  expect(result.status).toBe(409);
  expect(await result.json()).toMatchObject({ code: "date_taken" });
  expect(interleaved).toHaveBeenCalledOnce();
});

it("returns the receipt if an identical concurrent publication wins", async () => {
  const insert = store.insert;
  vi.spyOn(store, "insert").mockImplementationOnce(async (sermon, revision) => {
    await insert(sermon, revision);
    await insert(sermon, revision);
  });
  const result = await publish();
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(receipt);
  expect((await store.list()).sermons).toHaveLength(1);
});

it("returns retryable 503 after three write conflicts", async () => {
  const insert = vi.spyOn(store, "insert").mockRejectedValue(new ConflictError());
  const list = vi.spyOn(store, "list");
  const result = await publish();
  expect(result.status).toBe(503);
  expect(result.headers.get("retry-after")).toBe("2");
  expect(insert).toHaveBeenCalledTimes(3);
  expect(list).toHaveBeenCalledTimes(3);
});

it("returns 500 for an unexpected storage failure", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(store, "insert").mockRejectedValue(new Error("Test storage failure"));
  const result = await publish();
  expect(result.status).toBe(500);
  expect(await result.json()).toEqual({ error: "Could not publish the sermon." });
});
