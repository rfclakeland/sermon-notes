import { ConflictError } from "@/lib/sermon/service";
import { publicSermons } from "@/lib/sermon/public";
import { SERMON_ID_RE, validateCollection } from "@/lib/sermon/validate";
import {
  authConfig,
  authError,
  authorizeWrite,
  boundedBytes,
  jsonObject,
  privateJson,
  staffAccess,
} from "./auth";
import { readEnv, type WorkerEnv } from "./env";
import { HttpError, requirePermission } from "./platform-auth/index.js";
import { createD1Store, devMemoryStore, type SermonStore } from "./store";

const COVER_MAX = 2 * 1024 * 1024;
const COLLECTION_MAX = 32 * 1024 * 1024;

function storeFor(env: WorkerEnv): SermonStore {
  if (env.DB) return createD1Store(env.DB, env.COVERS);
  if (import.meta.env.DEV) return devMemoryStore();
  throw new Error("Database is not configured.");
}

export async function handleList(request: Request) {
  try {
    const env = readEnv(request);
    const staff = new URL(request.url).searchParams.get("scope") === "staff";
    if (staff) {
      const { access } = await staffAccess(request, authConfig(env));
      requirePermission(access, "notes.sermons.view");
    }
    const collection = await storeFor(env).list();
    if (staff) return privateJson(collection);
    return Response.json({ ...collection, sermons: publicSermons(collection.sermons) });
  } catch (error) {
    return authError(error, "Could not load sermons.");
  }
}

export async function handleSave(request: Request) {
  try {
    const env = readEnv(request);
    const access = await authorizeWrite(request, env, "application/json");
    const incoming = await jsonObject(request, COLLECTION_MAX);
    if (!Number.isSafeInteger(incoming["revision"])) throw new HttpError(400, "Missing revision.");
    let validated;
    try {
      validated = validateCollection(incoming);
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
    const store = storeFor(env);
    if (!access.permissions.has("notes.sermons.delete")) {
      const current = await store.list();
      if (current.revision !== validated.revision) throw new ConflictError();
      const ids = new Set(validated.sermons.map((sermon) => sermon.id));
      if (current.sermons.some((sermon) => !ids.has(sermon.id))) {
        throw new HttpError(403, "You don’t have permission to delete sermons.");
      }
    }
    return privateJson(await store.save(validated.sermons, validated.revision));
  } catch (error) {
    if (error instanceof ConflictError) return privateJson({ error: "conflict" }, 409);
    return authError(error, "Save failed.");
  }
}

export async function handleCoverUpload(request: Request) {
  try {
    const env = readEnv(request);
    await authorizeWrite(request, env, "image/jpeg");
    const bytes = await boundedBytes(request, COVER_MAX);
    if (!bytes.byteLength) throw new HttpError(413, "That image must be a JPEG under 2 MB.");
    const id = crypto.randomUUID();
    await storeFor(env).putCover(id, bytes.buffer);
    return privateJson({ cover: `/api/covers/${id}` });
  } catch (error) {
    return authError(error, "Cover upload failed.");
  }
}

export async function handleCoverGet(request: Request, coverId: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(coverId);
  if (!isUuid && !SERMON_ID_RE.test(coverId)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await storeFor(readEnv(request)).getCover(coverId);
    if (!bytes) return new Response("Not found", { status: 404 });
    return new Response(bytes, {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("Not found", { status: 404 });
  }
}
