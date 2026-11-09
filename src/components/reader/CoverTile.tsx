import { Link } from "@tanstack/react-router";
import { draftHasContent, loadDraft } from "@/lib/sermon/drafts";
import { getSermonDoc, listBlanks } from "@/lib/sermon/delta";
import { formatDate } from "@/lib/sermon/export";
import type { Sermon } from "@/lib/sermon/types";

export function filledCount(sermon: Sermon) {
  const draft = loadDraft(sermon.id);
  const blanks = listBlanks(getSermonDoc(sermon));
  const filled = blanks.filter((blank) => (draft.blanks[blank.id] ?? "").trim()).length;
  return { filled, total: blanks.length, saved: draftHasContent(draft) };
}

export function CoverTile({ sermon, small = false }: { sermon: Sermon; small?: boolean }) {
  const notes = filledCount(sermon);
  return (
    <Link
      to="/sermons/$sermonId"
      params={{ sermonId: sermon.id }}
      className={small ? "tile sm" : "tile"}
    >
      {sermon.cover ? (
        <img src={sermon.cover} alt="" loading="lazy" width={960} height={600} />
      ) : null}
      {notes.saved ? (
        <span className="badge">
          Notes saved · {notes.filled} of {notes.total}
        </span>
      ) : null}
      <span className="cap">
        <span className="ref">{sermon.scripture}</span>
        <h3>{sermon.title}</h3>
        <span className="date">
          {formatDate(sermon.date)} · {sermon.speaker}
        </span>
      </span>
    </Link>
  );
}
