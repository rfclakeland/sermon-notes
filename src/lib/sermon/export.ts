import { docToPlainText, getSermonDoc } from "./delta";
import { fillOutline, outlineBlankIds, type NoteContext } from "./note-context";
import type { Sermon, VisitorDraft } from "./types";

export const CHURCH_NAME = "Restoration Fellowship Church of Lakeland";

export const SAMPLE_NOTICE =
  "Sample outlines for this preview — not recordings of Restoration Fellowship services.";

export function formatDate(iso: string, style: "long" | "short" = "long") {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: style === "long" ? "long" : undefined,
    month: style === "long" ? "long" : "short",
    day: "numeric",
    year: "numeric",
  });
}

export function bibleGatewayUrl(reference: string) {
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(reference)}&version=NIV`;
}

/**
 * Public sermon link. Only the sermon id is included — never visitor blanks
 * or reflections. Older `/#sermon=` links still open via the home-page redirect.
 */
export function shareUrl(origin: string, sermonId: string) {
  const base = origin.replace(/\/$/, "");
  return `${base}/sermons/${encodeURIComponent(sermonId)}`;
}

/** Guard used before copying a link, so a notes payload cannot ride along. */
export function shareUrlIncludesNotes(
  url: string,
  draft: { blanks: Record<string, string>; personal: string },
) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  const blob = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if ([...parsed.searchParams.keys()].some((key) => /note|personal|blank|draft|answer/i.test(key)))
    return true;
  const personal = draft.personal.trim();
  if (personal.length > 8 && blob.includes(personal)) return true;
  for (const value of Object.values(draft.blanks)) {
    const typed = value.trim();
    if (typed.length > 3 && blob.includes(typed)) return true;
  }
  return false;
}

/** Complete notes as plain text. When `revealed`, blanks show model answers (what's visible). */
export function buildNotesText(sermon: Sermon, draft: VisitorDraft, revealed: boolean) {
  const doc = getSermonDoc(sermon);
  const body = docToPlainText(doc, (b) =>
    revealed && b.answer ? b.answer : (draft.blanks[b.id] ?? ""),
  );
  const meta = [formatDate(sermon.date), sermon.speaker, sermon.scripture]
    .filter(Boolean)
    .join(" · ");
  return [
    sermon.title,
    meta,
    CHURCH_NAME,
    "",
    body,
    "",
    "MY NOTES",
    draft.personal.trim() || "(none)",
    "",
  ].join("\n");
}

export type OrphanReason = "removed" | "unavailable";

export const ORPHAN_NOTICE: Record<OrphanReason, string> = {
  removed: "This sermon is no longer listed. Your notes are still kept in this browser.",
  unavailable: "Sermon details couldn’t load right now. Your notes are still kept in this browser.",
};

/** Typed answers in outline order (falls back to save order without context). */
export function orphanAnswers(draft: VisitorDraft, context: NoteContext | null) {
  const order = context ? outlineBlankIds(context.outline) : [];
  const ids = [...order, ...Object.keys(draft.blanks).filter((id) => !order.includes(id))];
  return ids.map((id) => (draft.blanks[id] ?? "").trim()).filter(Boolean);
}

/**
 * Plain-text notes for a sermon that is no longer in the public list. Uses only
 * what this browser kept (the visitor's draft and the saved outline context).
 */
export function buildOrphanNotesText(
  draft: VisitorDraft,
  context: NoteContext | null,
  reason: OrphanReason = "removed",
) {
  const title = context?.title || "Sermon notes";
  const meta = context
    ? [context.date ? formatDate(context.date) : "", context.speaker, context.scripture]
        .filter(Boolean)
        .join(" · ")
    : "";
  const body = context
    ? fillOutline(context.outline, draft.blanks)
    : orphanAnswers(draft, null)
        .map((answer, index) => `${index + 1}. ${answer}`)
        .join("\n") || "(no answers)";
  return [
    title,
    ...(meta ? [meta] : []),
    CHURCH_NAME,
    `(${ORPHAN_NOTICE[reason]})`,
    "",
    context ? body : `MY ANSWERS\n${body}`,
    "",
    "MY NOTES",
    draft.personal.trim() || "(none)",
    "",
  ].join("\n");
}

export function mailtoHref(sermon: Sermon, text: string) {
  return `mailto:?subject=${encodeURIComponent(`Sermon notes: ${sermon.title}`)}&body=${encodeURIComponent(text)}`;
}

export function downloadText(filename: string, text: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
