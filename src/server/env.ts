export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  meta: { changes: number };
}

export interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Like {
  prepare(sql: string): D1Prepared;
  batch(statements: D1Prepared[]): Promise<{ meta: { changes: number } }[]>;
}

export interface R2Like {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

export interface AuthMailer {
  send(message: {
    from: { email: string; name: string };
    to: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
}

export type WorkerEnv = {
  DB?: D1Like;
  COVERS?: R2Like;
  AUTH_DB?: D1Like;
  AUTH_SECRET?: string;
  APP_ORIGIN?: string;
  AUTH_MAILER?: AuthMailer;
  AUTH_FROM_ADDRESS?: string;
};

type WorkerRequest = Request & {
  runtime?: { cloudflare?: { env?: Record<string, unknown> } };
  waitUntil?: (work: Promise<unknown>) => void;
};

export function continueInWorker(request: Request, work: Promise<void>) {
  const { waitUntil } = request as WorkerRequest;
  if (waitUntil) waitUntil(work);
  else return work;
  return undefined;
}

function isD1(value: unknown): value is D1Like {
  return !!value && typeof value === "object" && "prepare" in value && "batch" in value;
}

function isR2(value: unknown): value is R2Like {
  return !!value && typeof value === "object" && "put" in value && "get" in value;
}

/** Nitro exposes bindings on the request and on the Worker global. */
export function readEnv(request: Request): WorkerEnv {
  const runtimeEnv = (request as WorkerRequest).runtime?.cloudflare?.env;
  const globalEnv = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const { DB, COVERS, AUTH_DB, AUTH_SECRET, APP_ORIGIN, AUTH_MAILER, AUTH_FROM_ADDRESS } =
    runtimeEnv ?? globalEnv ?? {};
  return {
    ...(isD1(DB) ? { DB } : {}),
    ...(isR2(COVERS) ? { COVERS } : {}),
    ...(isD1(AUTH_DB) ? { AUTH_DB } : {}),
    ...(typeof AUTH_SECRET === "string" ? { AUTH_SECRET } : {}),
    ...(typeof APP_ORIGIN === "string" ? { APP_ORIGIN } : {}),
    ...(AUTH_MAILER && typeof (AUTH_MAILER as AuthMailer).send === "function"
      ? { AUTH_MAILER: AUTH_MAILER as AuthMailer }
      : {}),
    ...(typeof AUTH_FROM_ADDRESS === "string" ? { AUTH_FROM_ADDRESS } : {}),
  };
}
