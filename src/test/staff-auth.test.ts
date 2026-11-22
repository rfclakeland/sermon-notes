// @vitest-environment node

import { readFileSync } from "node:fs";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handleCoverGet, handleCoverUpload, handleList, handleSave } from "@/server/api";
import {
  authConfig,
  handleLinkConsume,
  handleLinkRequest,
  handleLogin,
  handleLogout,
  handleSession,
} from "@/server/auth";
import type { AuthMailer, WorkerEnv } from "@/server/env";
import {
  hashPassword,
  issueLink,
  REQUEST_MESSAGE,
  signInPassword,
} from "@/server/platform-auth/index.js";
import { createD1Store, createMemoryStore } from "@/server/store";
import { demoSermons } from "@/lib/sermon/demo-data";
import { ConflictError } from "@/lib/sermon/service";
import { publicSermons } from "@/lib/sermon/public";
import type { SermonCollection } from "@/lib/sermon/types";
import { SQLiteD1 } from "./d1-sqlite";

const sql = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const schema = sql("platform/fixtures/platform-schema.sql");
const migration = sql("platform/migrations/0001_notes_permissions.sql");
const users = sql("platform/fixtures/users.sql");
const contentSchema = sql("migrations/0001_init.sql");
const origin = "https://notes.example.com";
const secret = "local-test-secret-at-least-32-characters";
const password = "local-demo-password";
const staffList = "/api/sermons?scope=staff";
const cookiePattern = /^__Host-rfc_session=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax;/;

let identity: SQLiteD1;
let content: SQLiteD1;
let env: WorkerEnv;
let passwordHash: string;
const send = vi.fn<AuthMailer["send"]>();

function request(path: string, init?: RequestInit, bindings = env) {
  const headers = new Headers(init?.headers);
  headers.set("cf-connecting-ip", "192.0.2.1");
  return Object.assign(new Request(origin + path, { ...init, headers }), {
    runtime: { cloudflare: { env: bindings } },
  });
}

function post(path: string, body: unknown, cookie = "", bindings = env, from = origin) {
  return request(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: from, cookie },
      body: JSON.stringify(body),
    },
    bindings,
  );
}

function cookieFrom(response: Response) {
  const header = response.headers.get("set-cookie") ?? "";
  expect(header).toMatch(cookiePattern);
  return header.split(";")[0]!;
}

async function login(email = "editor@example.com") {
  const response = await handleLogin(post("/api/login", { email, password }));
  expect(response.status).toBe(200);
  return cookieFrom(response);
}

async function list(cookie: string): Promise<SermonCollection> {
  const response = await handleList(request(staffList, { headers: { cookie } }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.json();
}

function upload(cookie = "", bindings = env) {
  return handleCoverUpload(
    request(
      "/api/covers",
      {
        method: "POST",
        headers: { origin, cookie, "content-type": "image/jpeg" },
        body: new Uint8Array([255, 216, 255, 217]),
      },
      bindings,
    ),
  );
}

function mailToken(address: string) {
  const mail = send.mock.calls.at(-1)?.[0];
  expect(mail?.to).toBe(address);
  const link = new URL(mail?.text.match(/https:\/\/\S+/)?.[0] ?? "");
  expect(link.origin).toBe(origin);
  expect(link.pathname).toBe("/login/link");
  return new URLSearchParams(link.hash.slice(1)).get("token");
}

beforeAll(async () => {
  passwordHash = await hashPassword(password);
});

beforeEach(() => {
  identity = new SQLiteD1();
  identity.db.exec(schema + migration + users);
  const addPassword = identity.db.prepare(
    "INSERT INTO platform_passwords(user_id, password_hash, updated_at) SELECT id, ?, unixepoch() FROM platform_users",
  );
  addPassword.run(passwordHash);
  content = new SQLiteD1();
  content.db.exec(contentSchema);
  send.mockReset().mockResolvedValue({ messageId: "local-message" });
  const covers = new Map<string, ArrayBuffer>();
  env = {
    AUTH_DB: identity,
    AUTH_SECRET: secret,
    APP_ORIGIN: origin,
    AUTH_MAILER: { send },
    AUTH_FROM_ADDRESS: "media@rfclakeland.com",
    DB: content,
    COVERS: {
      async put(id, bytes) {
        covers.set(id, bytes);
      },
      async get(id) {
        const bytes = covers.get(id);
        return bytes
          ? {
              async arrayBuffer() {
                return bytes;
              },
            }
          : null;
      },
    },
  };
});

afterEach(() => {
  identity.db.close();
  content.db.close();
  vi.unstubAllEnvs();
});

describe("RFC staff authorization", () => {
  it("reports signed out and requires a session for writes and staff lists", async () => {
    const session = await handleSession(request("/api/session"));
    expect(session.status).toBe(200);
    expect(await session.json()).toEqual({ authenticated: false, emailLinks: true });
    expect((await handleSave(post("/api/sermons", {}))).status).toBe(401);
    expect((await upload()).status).toBe(401);
    expect((await handleList(request(staffList))).status).toBe(401);
  });

  it("does not accept the legacy staff password or issue a session for bad credentials", async () => {
    const old = "fictional-legacy-password";
    vi.stubEnv("STAFF_PASSWORD", old);
    const bindings = { ...env, STAFF_PASSWORD: old };
    const legacy = await handleLogin(post("/api/login", { password: old }, "", bindings));
    const wrong = await handleLogin(
      post("/api/login", { email: "editor@example.com", password: old }, "", bindings),
    );
    for (const response of [legacy, wrong]) {
      expect(response.status).toBe(401);
      expect(response.headers.has("set-cookie")).toBe(false);
    }
    expect(identity.db.prepare("SELECT * FROM platform_sessions").all()).toEqual([]);
  });

  it("allows a Notes admin to view drafts, edit, delete and upload a cover", async () => {
    const cookie = await login();
    const session = await handleSession(request("/api/session", { headers: { cookie } }));
    expect(await session.json()).toEqual({
      authenticated: true,
      displayName: "Demo Editor",
      permissions: [
        "notes.access",
        "notes.admin",
        "notes.sermons.delete",
        "notes.sermons.edit",
        "notes.sermons.view",
      ],
      emailLinks: true,
    });
    expect(
      identity.db.prepare("SELECT token_hash FROM platform_sessions").get()?.["token_hash"],
    ).not.toBe(cookie.split("=")[1]);
    const collection = await list(cookie);
    collection.sermons[0] = { ...collection.sermons[0]!, title: "Draft outline", status: "draft" };
    const edited = await handleSave(post("/api/sermons", collection, cookie));
    expect(edited.status).toBe(200);
    const next = await list(cookie);
    expect(next.sermons[0]?.title).toBe("Draft outline");
    const publicList = await handleList(request("/api/sermons", { headers: { cookie } }));
    expect(((await publicList.json()) as SermonCollection).sermons).toHaveLength(
      next.sermons.length - 1,
    );
    const deleted = await handleSave(
      post(
        "/api/sermons",
        {
          sermons: next.sermons.slice(1),
          revision: next.revision,
        },
        cookie,
      ),
    );
    expect(deleted.status).toBe(200);
    expect((await list(cookie)).sermons).toHaveLength(next.sermons.length - 1);
    const result = await upload(cookie);
    expect(result.status).toBe(200);
    const { cover } = (await result.json()) as { cover: string };
    expect((await handleCoverGet(request(cover), cover.split("/").at(-1)!)).status).toBe(200);
    expect(
      content.db.prepare("SELECT name FROM sqlite_schema WHERE name GLOB 'platform_*'").all(),
    ).toEqual([]);
  });

  it("refuses volunteers and revokes only the session created by the Notes attempt", async () => {
    const existing = await signInPassword(
      request("/api/login"),
      authConfig(env),
      "volunteer@example.com",
      password,
    );
    const cookie = `__Host-rfc_session=${existing}`;
    const denied = await handleLogin(
      post("/api/login", { email: "volunteer@example.com", password }, cookie),
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.has("set-cookie")).toBe(false);
    expect((await handleSession(request("/api/session", { headers: { cookie } }))).status).toBe(
      403,
    );
    expect((await handleList(request(staffList, { headers: { cookie } }))).status).toBe(403);
    expect((await handleSave(post("/api/sermons", {}, cookie))).status).toBe(403);
    expect((await upload(cookie)).status).toBe(403);
    expect(
      identity.db.prepare("SELECT revoked_at FROM platform_sessions ORDER BY rowid").all(),
    ).toEqual([{ revoked_at: null }, { revoked_at: expect.any(Number) }]);
  });

  it("uses effective denies on an otherwise authorized role", async () => {
    const cookie = await login("denied@example.com");
    const session = await handleSession(request("/api/session", { headers: { cookie } }));
    expect(await session.json()).toMatchObject({
      authenticated: true,
      permissions: ["notes.access", "notes.sermons.delete", "notes.sermons.view"],
    });
    expect((await list(cookie)).sermons.length).toBeGreaterThan(0);
    expect((await handleSave(post("/api/sermons", {}, cookie))).status).toBe(403);
    expect((await upload(cookie)).status).toBe(403);
  });

  it("permits edits and blocks a whole-collection save that removes an ID", async () => {
    const cookie = await login("nodelete@example.com");
    const collection = await list(cookie);
    collection.sermons[0] = { ...collection.sermons[0]!, title: "Allowed edit" };
    expect((await handleSave(post("/api/sermons", collection, cookie))).status).toBe(200);
    const current = await list(cookie);
    const response = await handleSave(
      post(
        "/api/sermons",
        {
          sermons: current.sermons.slice(1),
          revision: current.revision,
        },
        cookie,
      ),
    );
    expect(response.status).toBe(403);
    expect(await list(cookie)).toEqual(current);
    expect((await handleSave(post("/api/sermons", collection, cookie))).status).toBe(409);
  });

  it("revokes the current session row on sign-out", async () => {
    const cookie = await login();
    const response = await handleLogout(post("/api/logout", {}, cookie));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/__Host-rfc_session=;.*Max-Age=0/);
    expect(
      identity.db.prepare("SELECT revoked_at FROM platform_sessions").get()?.["revoked_at"],
    ).toEqual(expect.any(Number));
    const session = await handleSession(request("/api/session", { headers: { cookie } }));
    expect(await session.json()).toMatchObject({ authenticated: false });
    expect((await handleSave(post("/api/sermons", {}, cookie))).status).toBe(401);
  });

  it.each(["AUTH_DB", "AUTH_SECRET"] as const)("fails closed without %s", async (name) => {
    const bindings = { ...env };
    delete bindings[name];
    for (const response of await Promise.all([
      handleSession(request("/api/session", {}, bindings)),
      handleLogin(post("/api/login", { email: "editor@example.com", password }, "", bindings)),
      handleLinkRequest(post("/api/link/request", {}, "", bindings)),
      handleLinkConsume(post("/api/link/consume", {}, "", bindings)),
      handleLogout(post("/api/logout", {}, "", bindings)),
      handleList(request(staffList, {}, bindings)),
      handleSave(post("/api/sermons", {}, "", bindings)),
      upload("", bindings),
    ]))
      expect(response.status).toBe(503);
    expect((await handleList(request("/api/sermons", {}, bindings))).status).toBe(200);
  });

  it("rejects cross-origin POSTs on all staff actions", async () => {
    const cookie = await login();
    for (const [path, handle] of [
      ["/api/login", handleLogin],
      ["/api/link/request", handleLinkRequest],
      ["/api/link/consume", handleLinkConsume],
      ["/api/logout", handleLogout],
      ["/api/sermons", handleSave],
    ] as const) {
      expect((await handle(post(path, {}, cookie, env, "https://other.example.com"))).status).toBe(
        403,
      );
    }
    expect(
      (
        await handleCoverUpload(
          request("/api/covers", {
            method: "POST",
            headers: {
              cookie,
              origin,
              "sec-fetch-site": "cross-site",
              "content-type": "image/jpeg",
            },
          }),
        )
      ).status,
    ).toBe(403);
    expect((await handleList(request(staffList, { headers: { cookie } }))).status).toBe(200);
  });

  it("enforces JSON media type, object shape, and body size", async () => {
    expect(
      (
        await handleLogin(
          request("/api/login", {
            method: "POST",
            headers: { origin, "content-type": "text/plain" },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(415);
    expect((await handleLogin(post("/api/login", null))).status).toBe(400);
    expect(
      (await handleLinkRequest(post("/api/link/request", { email: "x".repeat(8200) }))).status,
    ).toBe(413);
  });
});

describe("RFC sign-in links", () => {
  it("sends a Notes link at APP_ORIGIN and consumes it once for a session", async () => {
    const response = await handleLinkRequest(
      post("/api/link/request", { email: "EDITOR@example.com" }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ message: REQUEST_MESSAGE });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].subject).toBe("Sign in to Restoration Notes");
    const token = mailToken("editor@example.com");
    const issued = identity.db
      .prepare("SELECT expires_at - created_at AS ttl FROM platform_email_links")
      .get();
    expect(issued?.["ttl"]).toBe(20 * 60);
    const consume = () => handleLinkConsume(post("/api/link/consume", { token }));
    const [first, second] = await Promise.all([consume(), consume()]);
    const [accepted, refused] = first.ok ? [first, second] : [second, first];
    expect(accepted.status).toBe(200);
    expect(refused.status).toBe(401);
    const cookie = cookieFrom(accepted);
    expect((await handleSession(request("/api/session", { headers: { cookie } }))).status).toBe(
      200,
    );
  });

  it("returns the same confirmation without sending to volunteers, inactive accounts, or denied access", async () => {
    const platformConfig = authConfig(env);
    await issueLink(
      request("/api/link/request"),
      platformConfig,
      "volunteer@example.com",
      Math.floor(Date.now() / 1000) - 120,
    );
    expect(send).toHaveBeenCalledTimes(1);
    send.mockClear();
    identity.db.exec("UPDATE platform_users SET active=0 WHERE id='fixture-editor'");
    identity.db.exec(`INSERT INTO platform_user_permission_overrides(user_id, permission, effect)
      VALUES ('fixture-denied', 'notes.access', 'deny')`);
    for (const email of [
      "volunteer@example.com",
      "editor@example.com",
      "denied@example.com",
      "unknown@example.com",
    ]) {
      const response = await handleLinkRequest(post("/api/link/request", { email }));
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ message: REQUEST_MESSAGE });
    }
    expect(send).not.toHaveBeenCalled();
    expect(
      identity.db.prepare("SELECT user_id, consumed_at FROM platform_email_links").all(),
    ).toEqual([{ user_id: "fixture-volunteer", consumed_at: null }]);
  });

  it("does not create a usable session when Notes access is removed before redemption", async () => {
    await handleLinkRequest(post("/api/link/request", { email: "editor@example.com" }));
    const token = mailToken("editor@example.com");
    identity.db.exec(`INSERT INTO platform_user_permission_overrides(user_id, permission, effect)
      VALUES ('fixture-editor', 'notes.access', 'deny')`);
    const response = await handleLinkConsume(post("/api/link/consume", { token }));
    expect(response.status).toBe(403);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(
      identity.db.prepare("SELECT revoked_at FROM platform_sessions").get()?.["revoked_at"],
    ).toEqual(expect.any(Number));
  });
});

describe("Notes role migration", () => {
  it("is idempotent and changes only the role catalog and role permissions", () => {
    const db = identity.db;
    db.exec("DELETE FROM platform_roles WHERE app='notes'");
    const snapshot = () =>
      db
        .prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")
        .all()
        .map(({ name }) => [String(name), db.prepare(`SELECT * FROM ${name}`).all()] as const);
    const before = new Map(snapshot());
    db.exec(migration);
    const after = new Map(snapshot());
    expect(
      [...after.keys()].filter(
        (key) => JSON.stringify(after.get(key)) !== JSON.stringify(before.get(key)),
      ),
    ).toEqual(["platform_role_permissions", "platform_roles"]);
    expect(
      db.prepare("SELECT role FROM platform_roles WHERE app='notes' ORDER BY role").all(),
    ).toEqual([{ role: "admin" }, { role: "editor" }]);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM platform_role_permissions WHERE app='notes'").get()?.[
        "n"
      ],
    ).toBe(9);
    db.exec(migration);
    expect(new Map(snapshot())).toEqual(after);
  });

  it("grants only existing identities and can run the grant twice", () => {
    const grant = sql("platform/grant-notes-role.sql.example");
    const db = identity.db;
    const count = () =>
      db.prepare("SELECT COUNT(*) AS n FROM platform_user_app_roles").get()?.["n"];
    const before = Number(count());
    db.exec(grant.replaceAll("REPLACE_WITH_EMAIL", "unknown@example.com"));
    expect(count()).toBe(before);
    db.exec(grant.replaceAll("REPLACE_WITH_EMAIL", "volunteer@example.com"));
    db.exec(grant.replaceAll("REPLACE_WITH_EMAIL", "VOLUNTEER@example.com"));
    expect(count()).toBe(before + 1);
  });
});

it("commits only one whole-collection save for a D1 revision under concurrent writes", async () => {
  const store = createD1Store(content);
  const collection = await store.list();
  const outcomes = await Promise.allSettled([
    store.save(collection.sermons, collection.revision),
    store.save([], collection.revision),
  ]);
  expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.find((result) => result.status === "rejected")).toMatchObject({
    reason: expect.any(ConflictError),
  });
  expect(await store.list()).toEqual(
    outcomes.find((result) => result.status === "fulfilled")?.value,
  );
});

describe("sermon store", () => {
  it("keeps drafts in the full collection and out of a public read", async () => {
    const store = createMemoryStore(demoSermons());
    const current = await store.list();
    const draft = {
      ...current.sermons[0]!,
      id: "evening-draft",
      title: "Evening draft",
      status: "draft" as const,
    };
    const saved = await store.save([draft, ...current.sermons], current.revision);
    expect(saved.sermons.some((sermon) => sermon.id === "evening-draft")).toBe(true);
    expect(publicSermons(saved.sermons).some((sermon) => sermon.id === "evening-draft")).toBe(
      false,
    );
    expect(saved.revision).toBe(current.revision + 1);
  });

  it("rejects a stale revision", async () => {
    const store = createMemoryStore(demoSermons());
    const current = await store.list();
    await expect(store.save(current.sermons, current.revision - 1)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});
