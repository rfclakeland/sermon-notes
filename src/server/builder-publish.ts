import { ConflictError } from "@/lib/sermon/service";
import type { Sermon } from "@/lib/sermon/types";
import { validateSermon } from "@/lib/sermon/validate";
import { passwordsMatch } from "./auth";
import { readEnv } from "./env";
import { storeFor } from "./store";

const BODY_MAX_BYTES = 256 * 1024;
const MAX_OPS = 5_000;
const MAX_ATTEMPTS = 3;
const BUILDER_ID =
  /^builder-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-(\d{4}-\d{2}-\d{2})$/;
const VISIBLE_TEXT = /[^\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cc}]/u;

function json(body: unknown, status: number, headers?: Record<string, string>) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

function publicOrigin(value: string | undefined) {
  // Allow the optional root slash. Reject credentials, paths and even empty queries/fragments.
  if (!value || value !== value.trim() || !/^https?:\/\/[^/?#@\\\s]+\/?$/i.test(value))
    return undefined;
  try {
    const url = new URL(value);
    const local =
      (import.meta.env.DEV || import.meta.env.MODE === "test") && url.hostname === "localhost";
    return url.protocol === "https:" || (local && url.protocol === "http:")
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

/** Returns null when the request exceeds the byte limit. */
async function readBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > BODY_MAX_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > BODY_MAX_BYTES) {
        void reader.cancel().catch(() => {});
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function validateBuilderSermon(body: unknown): Sermon {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("Expected an object.");
  const { id, title, date, speaker, scripture, content } = body as Record<string, unknown>;
  if (
    typeof id !== "string" ||
    typeof date !== "string" ||
    BUILDER_ID.exec(id)?.[1] !== date ||
    !id.endsWith(date)
  ) {
    throw new Error("Invalid Builder id.");
  }
  const day = new Date(`${date}T00:00:00.000Z`);
  if (
    !Number.isFinite(day.getTime()) ||
    date.startsWith("0000-") ||
    day.toISOString().slice(0, 10) !== date
  ) {
    throw new Error("Invalid sermon date.");
  }
  const ops = (content as { ops?: unknown } | undefined)?.ops;
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > MAX_OPS) {
    throw new Error("Invalid document size.");
  }
  if (
    ops.some((op: { insert?: unknown } | null) => {
      const insert = op?.insert;
      return insert && typeof insert === "object" && Object.keys(insert).length !== 1;
    })
  ) {
    throw new Error("Each embed must contain exactly one item.");
  }
  const sermon = validateSermon({
    id,
    title,
    date,
    speaker,
    scripture,
    content,
    status: "published",
  });
  if (!VISIBLE_TEXT.test(sermon.title)) throw new Error("The sermon needs a visible title.");
  if (
    !sermon.content?.ops.some((op) => typeof op.insert === "string" && VISIBLE_TEXT.test(op.insert))
  ) {
    throw new Error("The outline needs visible text.");
  }
  sermon.title = sermon.title.trimEnd();
  sermon.speaker = sermon.speaker.trim();
  sermon.scripture = sermon.scripture.trim();
  return sermon;
}

function samePublication(existing: Sermon, incoming: Sermon) {
  return (
    existing.id === incoming.id &&
    existing.title.trimEnd() === incoming.title &&
    existing.date === incoming.date &&
    existing.speaker.trim() === incoming.speaker &&
    existing.scripture.trim() === incoming.scripture &&
    JSON.stringify(existing.content) === JSON.stringify(incoming.content)
  );
}

export async function handleBuilderPublish(request: Request) {
  const env = readEnv(request);
  const origin = publicOrigin(env.PUBLIC_ORIGIN);
  if (!env.BUILDER_PUBLISH_TOKEN || !origin)
    return json({ error: "Publishing is not configured." }, 503);

  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1] ?? "";
  if (!(await passwordsMatch(token, env.BUILDER_PUBLISH_TOKEN))) {
    return json({ error: "Builder credentials required." }, 401);
  }

  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json")
    return json({ error: "Send the notes as application/json." }, 415);

  let incoming: Sermon;
  try {
    const text = await readBody(request);
    if (text === null) return json({ error: "The notes are too large." }, 413);
    incoming = validateBuilderSermon(JSON.parse(text));
  } catch {
    return json({ error: "Invalid sermon notes." }, 400);
  }

  const receipt = { id: incoming.id, url: new URL(`/sermons/${incoming.id}`, origin).href };
  try {
    const store = storeFor(env);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const collection = await store.list();
      const existing = collection.sermons.find((sermon) => sermon.id === incoming.id);
      if (existing) {
        if (samePublication(existing, incoming)) return json(receipt, 200);
        return json(
          { error: "This sermon id already has different notes.", code: "id_conflict" },
          409,
        );
      }
      if (collection.sermons.some((sermon) => sermon.date === incoming.date)) {
        return json({ error: "There is already a sermon on this date.", code: "date_taken" }, 409);
      }
      try {
        await store.insert(incoming, collection.revision);
        return json(receipt, 201);
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
      }
    }
    return json({ error: "Concurrent save. Retry." }, 503, { "retry-after": "2" });
  } catch (error) {
    console.error(error);
    return json({ error: "Could not publish the sermon." }, 500);
  }
}
