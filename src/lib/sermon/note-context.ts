import { docToPlainText, getSermonDoc } from "./delta";
import { storageAvailable } from "./drafts";
import type { Sermon } from "./types";

/**
 * Public sermon context kept beside a visitor's notes (never sent anywhere), so
 * notes stay readable and downloadable if the sermon is later removed or
 * unpublished. Stored at `rfc-notes-context-v1:<sermon-id>`; the notes
 * themselves stay at `rfc-notes-v1:<sermon-id>`.
 */
export const CONTEXT_PREFIX = "rfc-notes-context-v1:";
export const contextKey = (sermonId: string) => `${CONTEXT_PREFIX}${sermonId}`;

export type NoteContext = {
  v: 1;
  id: string;
  title: string;
  date: string;
  speaker: string;
  scripture: string;
  /** Plain-text outline with each blank written as `{{blank:<id>}}`. */
  outline: string;
};

export const blankToken = (id: string) => `{{blank:${id}}}`;
const TOKEN_RE = /\{\{blank:([A-Za-z0-9_-]{1,64})\}\}/g;

export function buildNoteContext(sermon: Sermon): NoteContext {
  return {
    v: 1,
    id: sermon.id,
    title: sermon.title,
    date: sermon.date,
    speaker: sermon.speaker,
    scripture: sermon.scripture,
    outline: docToPlainText(getSermonDoc(sermon), (blank) => blankToken(blank.id)),
  };
}

export function parseNoteContext(raw: string | null): NoteContext | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || v.v !== 1 || typeof v.id !== "string" || typeof v.outline !== "string") return null;
    const str = (x: unknown) => (typeof x === "string" ? x : "");
    return {
      v: 1,
      id: v.id,
      title: str(v.title),
      date: str(v.date),
      speaker: str(v.speaker),
      scripture: str(v.scripture),
      outline: v.outline,
    };
  } catch {
    return null;
  }
}

export function loadNoteContext(sermonId: string): NoteContext | null {
  if (!storageAvailable()) return null;
  try {
    return parseNoteContext(window.localStorage.getItem(contextKey(sermonId)));
  } catch {
    return null;
  }
}

/** Best effort: a full or blocked storage never interrupts note-taking. */
export function saveNoteContext(sermon: Sermon) {
  if (!storageAvailable()) return;
  try {
    const next = JSON.stringify(buildNoteContext(sermon));
    if (window.localStorage.getItem(contextKey(sermon.id)) !== next) {
      window.localStorage.setItem(contextKey(sermon.id), next);
    }
  } catch {
    /* ignore */
  }
}

/** Fill a saved outline with the visitor's answers (blank line when empty). */
export function fillOutline(outline: string, answers: Record<string, string>) {
  return outline.replace(TOKEN_RE, (_, id: string) => (answers[id] ?? "").trim() || "________");
}

/** Blank ids that appear in the saved outline, in order. */
export function outlineBlankIds(outline: string) {
  return [...outline.matchAll(TOKEN_RE)].map((match) => match[1] ?? "");
}
