import { ConflictError, StaffAuthError, type SermonService, type StaffIdentity } from "./service";
import { validateCollection } from "./validate";

/** Cloudflare Worker adapter. The browser holds the session in an HttpOnly cookie. */
export function createHttpSermonService(base = ""): SermonService {
  const req = (path: string, init?: RequestInit) =>
    fetch(base + path, { credentials: "same-origin", ...init });

  const postJson = (path: string, body: object) =>
    req(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const authPost = async (path: string, body: object) => {
    const res = await postJson(path, body);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new StaffAuthError(
        res.status,
        data?.error || "Staff sign-in is temporarily unavailable.",
      );
    }
    return res;
  };

  return {
    kind: "http",
    async list(scope = "public") {
      const res = await req(scope === "staff" ? "/api/sermons?scope=staff" : "/api/sermons");
      if (!res.ok) throw new Error(`Could not load sermons (${res.status}).`);
      return validateCollection(await res.json());
    },
    async save(sermons, revision) {
      const res = await postJson("/api/sermons", { sermons, revision });
      if (res.status === 409) throw new ConflictError();
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || `Save failed (${res.status}).`);
      }
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
    async login(email, password) {
      await authPost("/api/login", { email, password });
    },
    async requestSignInLink(email) {
      const res = await authPost("/api/link/request", { email });
      return (await res.json()) as { message: string };
    },
    async consumeSignInLink(token) {
      await authPost("/api/link/consume", { token });
    },
    async session() {
      const res = await req("/api/session");
      if (res.status === 503) return { status: "not-connected" };
      if (res.status === 403) return { status: "no-access" };
      if (!res.ok) throw new Error("Couldn’t check your staff sign-in.");
      const session = (await res.json()) as
        { authenticated: false; emailLinks: boolean } | ({ authenticated: true } & StaffIdentity);
      return session.authenticated
        ? {
            status: "signed-in",
            identity: { displayName: session.displayName, permissions: session.permissions },
          }
        : { status: "signed-out", emailLinks: session.emailLinks };
    },
    async logout() {
      await authPost("/api/logout", {});
    },
  };
}
