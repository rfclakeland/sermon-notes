import { ConflictError, type SermonService } from "./service";
import { validateCollection } from "./validate";

/**
 * Integration target (NOT used by the prototype). Mirrors the existing
 * Cloudflare Worker API. Auth is the server's HttpOnly session cookie —
 * same-origin `credentials: "same-origin"` requests only.
 */
export function createHttpSermonService(base = ""): SermonService {
  const req = async (path: string, init?: RequestInit) => {
    const res = await fetch(base + path, { credentials: "same-origin", ...init });
    return res;
  };
  return {
    kind: "http",
    async list() {
      const res = await req("/api/sermons");
      if (!res.ok) throw new Error(`Could not load sermons (${res.status}).`);
      return validateCollection(await res.json());
    },
    async save(sermons, revision) {
      const res = await req("/api/sermons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sermons, revision }),
      });
      if (res.status === 409) throw new ConflictError();
      if (!res.ok) throw new Error(`Save failed (${res.status}).`);
      return validateCollection(await res.json());
    },
    async uploadCover(jpeg) {
      const res = await req("/api/covers", {
        method: "POST",
        headers: { "content-type": "image/jpeg" },
        body: jpeg,
      });
      if (!res.ok) throw new Error(`Cover upload failed (${res.status}).`);
      return (await res.json()) as { cover: string };
    },
    async login(password) {
      const res = await req("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      return res.ok;
    },
    async session() {
      const res = await req("/api/session");
      return res.ok ? ((await res.json()) as { authenticated: boolean }) : { authenticated: false };
    },
    async logout() {
      await req("/api/logout", { method: "POST" });
    },
  };
}
