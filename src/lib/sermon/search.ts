import { formatDate } from "./export";
import type { Sermon } from "./types";

/** Parses existing share links like /#sermon=hole-in-the-roof */
export function sermonFromHash(hash: string): string | null {
  const m = hash.replace(/^#/, "").match(/(?:^|&)sermon=([^&]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

export function matchesSermon(s: Sermon, q: string) {
  const norm = (t: string) => t.toLowerCase().replace(/[–—]/g, "-");
  const needle = norm(q.trim());
  if (!needle) return true;
  const hay = norm(
    [
      s.title,
      s.speaker,
      s.scripture,
      s.reference,
      s.date,
      formatDate(s.date),
      formatDate(s.date, "short"),
    ].join(" "),
  );
  if (hay.includes(needle)) return true;
  // Phrases with numbers (e.g. "mark 10") are Scripture/date lookups: require the phrase.
  if (/\d/.test(needle)) return false;
  return needle.split(/\s+/).every((w) => hay.includes(w));
}
