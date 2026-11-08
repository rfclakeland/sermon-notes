import { draftHasContent, listDraftIds, loadDraft, saveDraft } from "./drafts";
import type { VisitorDraft } from "./types";

export const NOTES_BACKUP_FORMAT = "rfc-notes-v1";

export type NotesBackup = {
  format: typeof NOTES_BACKUP_FORMAT;
  exportedAt: string;
  notes: Record<string, VisitorDraft>;
};

export function collectNotes(): Record<string, VisitorDraft> {
  const notes: Record<string, VisitorDraft> = {};
  for (const id of listDraftIds()) {
    const draft = loadDraft(id);
    if (draftHasContent(draft)) notes[id] = draft;
  }
  return notes;
}

export function buildBackup(): NotesBackup {
  return {
    format: NOTES_BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    notes: collectNotes(),
  };
}

/** Merge a backup into this browser. Returns how many sermons were restored. */
export function restoreBackup(raw: unknown): number {
  if (!raw || typeof raw !== "object") throw new Error("That file isn’t a notes backup.");
  const record = raw as { format?: unknown; notes?: unknown };
  if (record.format !== NOTES_BACKUP_FORMAT || !record.notes || typeof record.notes !== "object") {
    throw new Error("Choose a Restoration Notes backup file.");
  }
  let count = 0;
  for (const [id, value] of Object.entries(record.notes)) {
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) continue;
    if (!value || typeof value !== "object") continue;
    const source = value as { blanks?: unknown; personal?: unknown };
    const blanks: Record<string, string> = {};
    if (source.blanks && typeof source.blanks === "object") {
      for (const [key, text] of Object.entries(source.blanks)) {
        if (typeof text === "string") blanks[key] = text;
      }
    }
    const draft: VisitorDraft = {
      blanks,
      personal: typeof source.personal === "string" ? source.personal : "",
    };
    if (!saveDraft(id, draft)) throw new Error("This browser couldn’t store the restored notes.");
    count += 1;
  }
  return count;
}
