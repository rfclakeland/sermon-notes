import { afterEach, expect, it, vi } from "vitest";
import { handleBuilderPublish, handleList } from "@/server/api";

const origin = "https://notes.rfclakeland.com";
const date = "2038-01-10";
const id = `builder-0afce015-c76e-44ac-b7c6-25c5ff9a2f2d-${date}`;
const outline = {
  id, date, title: "Builder publication test",
  content: { ops: [{ insert: "An example " }, { insert: { blank: { id: "b-1", answer: "blank", multiline: false } } }, { insert: "\n" }] },
};

function publish(body: unknown, token = "builder-test-token") {
  return handleBuilderPublish(new Request(`${origin}/api/builder/publish`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body)
  }));
}

afterEach(() => vi.unstubAllGlobals());

it("authorizes publishing, preserves existing sermons, and safely reuses identical retries", async () => {
  vi.stubGlobal("__env__", { BUILDER_PUBLISH_TOKEN: "builder-test-token" });
  const before = await (await handleList(new Request(`${origin}/api/sermons`))).json();
  expect((await publish(outline, "wrong")).status).toBe(401);
  const created = await publish(outline);
  expect(created.status).toBe(201);
  expect(await created.json()).toEqual({ id, url: `${origin}/sermons/${id}` });
  expect((await publish(outline)).status).toBe(200);
  expect((await publish({ ...outline, title: "Different notes" })).status).toBe(409);
  expect((await publish({ ...outline, id: `builder-1afce015-c76e-44ac-b7c6-25c5ff9a2f2d-${date}` })).status).toBe(409);
  const after = await (await handleList(new Request(`${origin}/api/sermons`))).json();
  expect(after.sermons).toHaveLength(before.sermons.length + 1);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.sermons.find((sermon: { id: string }) => sermon.id === id)?.content).toEqual(outline.content);
});
