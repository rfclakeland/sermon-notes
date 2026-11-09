import type { VisitorDraft } from "./types";

/** Existing production key format — keep identical so current visitors' notes still load. */
export const DRAFT_PREFIX = "rfc-notes-v1:";
export const draftKey = (sermonId: string) => `${DRAFT_PREFIX}${sermonId}`;
export const emptyDraft = (): VisitorDraft => ({ blanks: {}, personal: "" });

let forcedUnavailable = false;
/** Demo hook: simulate a browser that blocks storage (private mode / disabled). */
export function setStorageForcedUnavailable(v: boolean) {
  forcedUnavailable = v;
}

export function storageAvailable(): boolean {
  if (forcedUnavailable || typeof window === "undefined") return false;
  try {
    const k = "__rfn_probe__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function parseDraft(raw: string | null): VisitorDraft {
  if (!raw) return emptyDraft();
  try {
    const v = JSON.parse(raw);
    const blanks: Record<string, string> = {};
    if (v && typeof v.blanks === "object" && v.blanks) {
      for (const [k, val] of Object.entries(v.blanks)) if (typeof val === "string") blanks[k] = val;
    }
    return { blanks, personal: typeof v?.personal === "string" ? v.personal : "" };
  } catch {
    return emptyDraft();
  }
}

export function draftHasContent(d: VisitorDraft) {
  return d.personal.trim() !== "" || Object.values(d.blanks).some((v) => v.trim() !== "");
}

export function loadDraft(sermonId: string): VisitorDraft {
  if (!storageAvailable()) return emptyDraft();
  return parseDraft(window.localStorage.getItem(draftKey(sermonId)));
}

/** Returns false when the browser refused to store (quota, privacy mode). */
export function saveDraft(sermonId: string, d: VisitorDraft): boolean {
  if (!storageAvailable()) return false;
  try {
    window.localStorage.setItem(draftKey(sermonId), JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function deleteDraft(sermonId: string) {
  try {
    window.localStorage.removeItem(draftKey(sermonId));
  } catch {
    /* ignore */
  }
}

export function listDraftIds(): string[] {
  if (!storageAvailable()) return [];
  const ids: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k?.startsWith(DRAFT_PREFIX)) ids.push(k.slice(DRAFT_PREFIX.length));
  }
  return ids;
}
