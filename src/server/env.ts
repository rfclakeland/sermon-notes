export interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Like {
  prepare(sql: string): D1Prepared;
  batch(statements: D1Prepared[]): Promise<unknown>;
}

export interface R2Like {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

export type WorkerEnv = {
  DB?: D1Like;
  COVERS?: R2Like;
  AUTH_SECRET?: string;
  STAFF_PASSWORD?: string;
};

function isD1(value: unknown): value is D1Like {
  return !!value && typeof value === "object" && "prepare" in value && "batch" in value;
}

function isR2(value: unknown): value is R2Like {
  return !!value && typeof value === "object" && "put" in value && "get" in value;
}

function bindingString(raw: Record<string, unknown>, key: "AUTH_SECRET" | "STAFF_PASSWORD") {
  const bound = raw[key];
  if (typeof bound === "string" && bound.length > 0) return bound;
  if (
    typeof process !== "undefined" &&
    typeof process.env?.[key] === "string" &&
    process.env[key]
  ) {
    return process.env[key];
  }
  return undefined;
}

/** Bindings from the Worker, or dev vars when `vite dev` has no platform proxy. */
export function readEnv(request?: Request): WorkerEnv {
  const fromRequest = request as Request & {
    runtime?: { cloudflare?: { env?: Record<string, unknown> } };
  };
  const runtimeEnv = fromRequest?.runtime?.cloudflare?.env;
  const globalEnv = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const raw = runtimeEnv && Object.keys(runtimeEnv).length > 0 ? runtimeEnv : (globalEnv ?? {});
  const auth = bindingString(raw, "AUTH_SECRET");
  const password = bindingString(raw, "STAFF_PASSWORD");
  const db = raw["DB"];
  const covers = raw["COVERS"];
  return {
    ...(isD1(db) ? { DB: db } : {}),
    ...(isR2(covers) ? { COVERS: covers } : {}),
    ...(auth ? { AUTH_SECRET: auth } : {}),
    ...(password ? { STAFF_PASSWORD: password } : {}),
  };
}
