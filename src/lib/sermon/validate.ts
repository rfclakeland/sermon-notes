import { sanitizeDoc } from "./delta";
import type { Sermon, SermonCollection, SermonStatus } from "./types";

export const SERMON_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A passage reference is a short citation, not a pasted translation. */
export function looksLikeEmbeddedVerse(value: string) {
  const text = value.trim();
  if (!text) return false;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > 14 || text.length > 80;
}

const str = (v: unknown, field: string, max = 300) => {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new Error(`"${field}" must be text.`);
  return v.slice(0, max);
};

export function validateSermon(raw: unknown, index = 0): Sermon {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any;
  const where = `Sermon ${index + 1}`;
  if (!r || typeof r !== "object") throw new Error(`${where} is not an object.`);
  if (typeof r.id !== "string" || !SERMON_ID_RE.test(r.id)) {
    throw new Error(`${where} has an invalid id (lowercase letters, numbers, hyphens).`);
  }
  if (typeof r.title !== "string" || !r.title.trim()) throw new Error(`${where} needs a title.`);
  if (typeof r.date !== "string" || !DATE_RE.test(r.date)) {
    throw new Error(`${where} needs a date in YYYY-MM-DD form.`);
  }
  if (r.status !== "draft" && r.status !== "published") {
    throw new Error(`${where} must set status to "draft" or "published".`);
  }
  const status: SermonStatus = r.status;
  const points = Array.isArray(r.points)
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.points.map((p: any) => ({
        before: str(p?.before, "before"),
        answer: str(p?.answer, "answer"),
        after: str(p?.after, "after"),
      }))
    : [];
  let cover: string | undefined;
  if (typeof r.cover === "string" && r.cover) {
    if (!/^(\/|data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(r.cover)) {
      throw new Error(`${where} has an unsupported cover address.`);
    }
    cover = r.cover;
  }
  let content;
  if (r.content !== undefined && r.content !== null) {
    try {
      content = sanitizeDoc(r.content);
    } catch (e) {
      throw new Error(`${where}: ${(e as Error).message}`);
    }
  }
  const scripture = str(r.scripture, "scripture");
  const reference = str(r.reference, "reference");
  if (looksLikeEmbeddedVerse(scripture) || looksLikeEmbeddedVerse(reference)) {
    throw new Error(`${where} should give a passage reference, not pasted scripture text.`);
  }
  return {
    id: r.id,
    title: r.title.trim().slice(0, 200),
    date: r.date,
    speaker: str(r.speaker, "speaker"),
    scripture,
    reference,
    status,
    ...(cover ? { cover } : {}),
    context: str(r.context, "context", 5000),
    lead: str(r.lead, "lead", 1000),
    points,
    ...(content ? { content } : {}),
  };
}

export function validateCollection(raw: unknown): SermonCollection {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any;
  if (!r || !Array.isArray(r.sermons)) throw new Error('File must contain a "sermons" list.');
  const sermons = r.sermons.map(validateSermon);
  const ids = new Set<string>();
  for (const s of sermons) {
    if (ids.has(s.id)) throw new Error(`Sermon id "${s.id}" appears twice.`);
    ids.add(s.id);
  }
  return { sermons, revision: Number.isFinite(r.revision) ? Number(r.revision) : 0 };
}

export function sortNewestFirst(sermons: Sermon[]) {
  return [...sermons].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
