import { continueInWorker, readEnv, type WorkerEnv } from "./env";
import {
  approvedOrigin,
  authenticate,
  configuration,
  consumeLink,
  HttpError,
  issueLink,
  loadAccess,
  REQUEST_MESSAGE,
  requirePermission,
  revokeSession,
  sessionCookie,
  signInPassword,
  type Configuration,
} from "./platform-auth/index.js";

const NO_ACCESS = "Your RFC account doesn’t have Notes editor access. Ask an administrator.";
const APP = "notes";

export function authConfig(env: WorkerEnv) {
  const { AUTH_DB, AUTH_SECRET, APP_ORIGIN, APP_ORIGIN_ALIASES, AUTH_MAILER, AUTH_FROM_ADDRESS } =
    env;
  if (!AUTH_DB || !AUTH_SECRET || AUTH_SECRET.length < 32 || /REPLACE_ME/.test(AUTH_SECRET)) {
    throw new HttpError(503, "Staff sign-in isn’t connected yet.");
  }
  if (!APP_ORIGIN) throw new HttpError(503, "Staff sign-in isn’t connected yet.");

  const config = configuration({
    db: AUTH_DB,
    secret: AUTH_SECRET,
    appOrigin: APP_ORIGIN,
    // Extra HTTPS origins (for example the workers.dev address) that may sign in alongside APP_ORIGIN.
    aliases: (APP_ORIGIN_ALIASES ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    appId: APP,
  });
  if (AUTH_MAILER && AUTH_FROM_ADDRESS && /^[^\s@<>]+@rfclakeland\.com$/i.test(AUTH_FROM_ADDRESS)) {
    config.sendAuthEmail = async ({ to, name, link, expiresMinutes }) => {
      await AUTH_MAILER.send({
        from: { email: AUTH_FROM_ADDRESS, name: "Restoration Notes · RFC" },
        to,
        subject: "Sign in to Restoration Notes",
        text:
          `Hi ${name || "there"},\n\nOpen this one-time link to sign in to Restoration Notes:\n` +
          `${link}\n\nIt expires in ${expiresMinutes} minutes. If you didn’t request it, you can ignore this email.\n\nRestoration Notes · Restoration Fellowship Church`,
      });
    };
  }
  return config;
}

export async function staffAccess(request: Request, config: Configuration) {
  const user = await authenticate(request, config);
  const access = await loadAccess(config.db, user.id, APP);
  if (!access.permissions.has("notes.access")) throw new HttpError(403, NO_ACCESS);
  return { user, access };
}

export function sameOrigin(request: Request, config: Configuration, contentType: string) {
  const origin = approvedOrigin(request, config);
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (request.headers.get("Origin") !== origin || (fetchSite && fetchSite !== "same-origin")) {
    throw new HttpError(403, "Same-origin request required.");
  }
  const mediaType = request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== contentType) throw new HttpError(415, `Send ${contentType}.`);
}

export async function boundedBytes(request: Request, limit: number) {
  if (Number(request.headers.get("Content-Length")) > limit) {
    throw new HttpError(413, "Request is too large.");
  }
  const reader = request.body?.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, "Request is too large.");
      }
      parts.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

export async function jsonObject(request: Request, limit = 8192): Promise<Record<string, unknown>> {
  const bytes = await boundedBytes(request, limit);
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Send a JSON object.");
  }
}

export function privateJson(body: unknown, status = 200, headers?: Record<string, string>) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

export function authError(error: unknown, fallback = "Staff sign-in is temporarily unavailable.") {
  if (error instanceof HttpError) return privateJson({ error: error.message }, error.status);
  console.error(fallback);
  return privateJson({ error: fallback }, 500);
}

async function signInResponse(request: Request, config: Configuration, token: string) {
  const headers = new Headers();
  headers.set("cookie", `${config.cookieName}=${token}`);
  const newSession = new Request(request.url, { headers });
  try {
    await staffAccess(newSession, config);
  } catch (error) {
    // Revoke only the token just created by this attempt.
    await revokeSession(newSession, config);
    throw error;
  }
  return privateJson({ ok: true }, 200, { "set-cookie": sessionCookie(config, token) });
}

export async function handleLogin(request: Request) {
  try {
    const config = authConfig(readEnv(request));
    sameOrigin(request, config, "application/json");
    const { email, password } = await jsonObject(request);
    const token = await signInPassword(request, config, email, password);
    return await signInResponse(request, config, token);
  } catch (error) {
    return authError(error);
  }
}

export async function handleLinkRequest(request: Request) {
  try {
    const config = authConfig(readEnv(request));
    sameOrigin(request, config, "application/json");
    const { email } = await jsonObject(request);
    const work = issueLink(request, config, email, undefined, "notes.access").catch(() => {
      console.error("Could not process a Notes sign-in link request.");
    });
    await continueInWorker(request, work);
    return privateJson({ message: REQUEST_MESSAGE }, 202);
  } catch (error) {
    return authError(error);
  }
}

export async function handleLinkConsume(request: Request) {
  try {
    const config = authConfig(readEnv(request));
    sameOrigin(request, config, "application/json");
    const { token } = await jsonObject(request);
    const session = await consumeLink(request, config, token);
    return await signInResponse(request, config, session.token);
  } catch (error) {
    return authError(error);
  }
}

export async function handleSession(request: Request) {
  try {
    const config = authConfig(readEnv(request));
    try {
      const { user, access } = await staffAccess(request, config);
      return privateJson({
        authenticated: true,
        displayName: user.display_name,
        permissions: [...access.permissions].sort(),
        emailLinks: !!config.sendAuthEmail,
      });
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401) throw error;
      return privateJson({ authenticated: false, emailLinks: !!config.sendAuthEmail });
    }
  } catch (error) {
    return authError(error);
  }
}

export async function handleLogout(request: Request) {
  try {
    const config = authConfig(readEnv(request));
    sameOrigin(request, config, "application/json");
    await jsonObject(request);
    await revokeSession(request, config);
    return privateJson({ ok: true }, 200, { "set-cookie": sessionCookie(config, "", 0) });
  } catch (error) {
    return authError(error);
  }
}

export async function authorizeWrite(request: Request, env: WorkerEnv, type: string) {
  const config = authConfig(env);
  const { access } = await staffAccess(request, config);
  requirePermission(access, "notes.sermons.edit");
  sameOrigin(request, config, type);
  return access;
}
