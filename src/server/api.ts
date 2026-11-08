import { ConflictError } from "@/lib/sermon/service";
import { publicSermons } from "@/lib/sermon/public";
import { validateCollection } from "@/lib/sermon/validate";
import { clearSessionCookie, isStaff, passwordsMatch, sessionCookie, signSession } from "./auth";
import { readEnv, type WorkerEnv } from "./env";
import { createD1Store, devMemoryStore, type SermonStore } from "./store";

const COVER_MAX = 2 * 1024 * 1024;

function storeFor(env: WorkerEnv): SermonStore {
  if (env.DB) return createD1Store(env.DB, env.COVERS);
  if (import.meta.env.DEV) return devMemoryStore();
  throw new Error("Database is not configured.");
}

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, headers ? { status, headers } : { status });
}

export async function handleList(request: Request) {
  try {
    const env = readEnv(request);
    const store = storeFor(env);
    const collection = await store.list();
    const staff = await isStaff(request, env.AUTH_SECRET);
    return json({
      sermons: staff ? collection.sermons : publicSermons(collection.sermons),
      revision: collection.revision,
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Could not load sermons." }, 500);
  }
}

export async function handleSave(request: Request) {
  const env = readEnv(request);
  if (!(await isStaff(request, env.AUTH_SECRET))) return json({ error: "Sign in required." }, 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send a sermon collection as JSON." }, 400);
  }
  const incoming = body as { sermons?: unknown; revision?: unknown };
  if (!Number.isFinite(incoming.revision)) return json({ error: "Missing revision." }, 400);
  let validated;
  try {
    validated = validateCollection({ sermons: incoming.sermons, revision: incoming.revision });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
  try {
    const saved = await storeFor(env).save(validated.sermons, Number(incoming.revision));
    return json(saved);
  } catch (error) {
    if (error instanceof ConflictError) return json({ error: "conflict" }, 409);
    console.error(error);
    return json({ error: "Save failed." }, 500);
  }
}

export async function handleLogin(request: Request) {
  const env = readEnv(request);
  if (!env.AUTH_SECRET || !env.STAFF_PASSWORD) {
    return json({ error: "Staff sign-in is not configured." }, 503);
  }
  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return json({ error: "Send a password." }, 400);
  }
  const ok = await passwordsMatch(password, env.STAFF_PASSWORD);
  if (!ok) return json({ error: "Unauthorized." }, 401);
  const token = await signSession(env.AUTH_SECRET);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(token, request) });
}

export async function handleSession(request: Request) {
  const env = readEnv(request);
  return json({ authenticated: await isStaff(request, env.AUTH_SECRET) });
}

export async function handleLogout(request: Request) {
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": clearSessionCookie(request) },
  });
}

export async function handleCoverUpload(request: Request) {
  const env = readEnv(request);
  if (!(await isStaff(request, env.AUTH_SECRET))) return json({ error: "Sign in required." }, 401);
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("image/jpeg")) return json({ error: "Send a JPEG image." }, 415);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > COVER_MAX) {
    return json({ error: "That image must be a JPEG under 2 MB." }, 413);
  }
  const id = crypto.randomUUID();
  try {
    await storeFor(env).putCover(id, bytes);
  } catch (error) {
    console.error(error);
    return json({ error: "Cover upload failed." }, 500);
  }
  return json({ cover: `/api/covers/${id}` });
}

export async function handleCoverGet(request: Request, coverId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(coverId)) return new Response("Not found", { status: 404 });
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
