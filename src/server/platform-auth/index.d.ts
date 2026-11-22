import type { D1Like } from "../env";

export class HttpError extends Error {
  constructor(status: number, message: string);
  readonly status: number;
}

type EmailLink = {
  purpose: "setup" | "signin";
  to: string;
  name: string;
  link: string;
  expiresMinutes: number;
};

type Options = {
  db: D1Like;
  secret: string;
  appOrigin: string;
  aliases?: string[];
  appId: string;
  sendAuthEmail?: (email: EmailLink) => Promise<void>;
};

export type Configuration = Options & { cookieName: string; origins: Set<string> };
export type Access = { permissions: Set<string>; apps: Set<string> };

export const REQUEST_MESSAGE: string;
export function configuration(options: Options): Configuration;
export function approvedOrigin(request: Request, config: Configuration): string;
export function authenticate(
  request: Request,
  config: Configuration,
): Promise<{ id: string; display_name: string; session_id: string }>;
export function loadAccess(db: D1Like, userId: string, app: string): Promise<Access>;
export function requirePermission(access: Access, permission: string): void;
export function sessionCookie(config: Configuration, token: string, maxAge?: number): string;
export function readCookie(request: Request, name: string): string | null;
export function revokeSession(request: Request, config: Configuration): Promise<void>;
export function signInPassword(
  request: Request,
  config: Configuration,
  email: unknown,
  password: unknown,
): Promise<string>;
export function issueLink(
  request: Request,
  config: Configuration,
  email: unknown,
  now?: number,
  permission?: string,
): Promise<void>;
export function consumeLink(
  request: Request,
  config: Configuration,
  token: unknown,
): Promise<{ token: string; needsPassword: boolean }>;
export function hashPassword(password: string): Promise<string>;
