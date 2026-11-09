import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PublicShell } from "@/components/layout/SiteHeader";
import { LoadError } from "@/components/reader/States";
import { getSermonDoc, listBlanks } from "@/lib/sermon/delta";
import { draftHasContent, listDraftIds, loadDraft, storageAvailable } from "@/lib/sermon/drafts";
import {
  buildNotesText,
  buildOrphanNotesText,
  downloadText,
  formatDate,
  ORPHAN_NOTICE,
  orphanAnswers,
  SAMPLE_NOTICE,
  type OrphanReason,
} from "@/lib/sermon/export";
import { fillOutline, loadNoteContext, type NoteContext } from "@/lib/sermon/note-context";
import { buildBackup, restoreBackup } from "@/lib/sermon/notes-backup";
import { useSermons } from "@/lib/sermon/queries";
import type { Sermon, VisitorDraft } from "@/lib/sermon/types";

type Row = {
  id: string;
  draft: VisitorDraft;
  sermon: Sermon | undefined;
  context: NoteContext | null;
};

function rowDate(row: Row) {
  return row.sermon?.date ?? row.context?.date ?? "";
}

function rowText(row: Row, reason: OrphanReason) {
  return row.sermon
    ? buildNotesText(row.sermon, row.draft, false)
    : buildOrphanNotesText(row.draft, row.context, reason);
}

export const Route = createFileRoute("/notes")({
  head: () => ({
    meta: [
      { title: "My notes — Restoration Notes" },
      { name: "description", content: "Sermon notes kept in this browser only." },
      { property: "og:title", content: "My notes — Restoration Notes" },
      { property: "og:description", content: "Notes saved on this device. No account." },
    ],
  }),
  component: MyNotes,
});

function MyNotes() {
  const query = useSermons("public");
  const fileRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<Record<
    string,
    { draft: VisitorDraft; context: NoteContext | null }
  > | null>(null);
  const [available, setAvailable] = useState(true);

  const refresh = () => {
    const next: Record<string, { draft: VisitorDraft; context: NoteContext | null }> = {};
    for (const id of listDraftIds()) {
      const draft = loadDraft(id);
      if (draftHasContent(draft)) next[id] = { draft, context: loadNoteContext(id) };
    }
    setDrafts(next);
  };

  useEffect(() => {
    setAvailable(storageAvailable());
    refresh();
  }, []);

  const sermons = query.data?.sermons ?? [];
  // A failed load is not the same as a removed sermon: say which one it is.
  const orphanReason: OrphanReason = query.isError ? "unavailable" : "removed";
  const rows: Row[] = drafts
    ? Object.entries(drafts)
        .map(([id, { draft, context }]) => ({
          id,
          draft,
          context,
          sermon: sermons.find((item) => item.id === id),
        }))
        .sort((a, b) => rowDate(b).localeCompare(rowDate(a)))
    : [];

  const downloadJournal = () => {
    const parts = rows.map((row) => rowText(row, orphanReason));
    if (!parts.length) {
      toast("No notes to download yet");
      return;
    }
    downloadText("restoration-notes-journal.txt", parts.join("\n\n—\n\n"));
    toast("Study journal downloaded");
  };

  const backup = () => {
    downloadText(
      `restoration-notes-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(buildBackup(), null, 2),
      "application/json",
    );
    toast("Backup file downloaded");
  };

  const onRestore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const count = restoreBackup(JSON.parse(await file.text()));
      refresh();
      toast(count === 1 ? "Restored notes for 1 sermon" : `Restored notes for ${count} sermons`);
    } catch (error) {
      toast(
        error instanceof SyntaxError ? "That file isn’t valid JSON." : (error as Error).message,
      );
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <PublicShell>
      <div className="wrap">
        <header className="page-head split">
          <div>
            <p className="eyebrow">Kept in this browser</p>
            <h1>My notes</h1>
            <p className="lede">
              Notes live on this device only — not linked to an account and not on your other
              devices. Download a journal or backup to keep a copy. {SAMPLE_NOTICE}
            </p>
          </div>
          <div className="quiet-acts">
            <button type="button" className="link-btn" onClick={downloadJournal}>
              Download journal
            </button>
            <button type="button" className="link-btn" onClick={backup}>
              Back up
            </button>
            <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>
              Restore…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Choose a backup file to restore"
              onChange={(event) => onRestore(event.target.files?.[0])}
            />
          </div>
        </header>

        {available && query.isError ? (
          <LoadError
            inline
            onRetry={() => query.refetch()}
            body="Sermon titles and outlines couldn’t load. Notes saved in this browser still show here and can be downloaded."
          />
        ) : null}
        {!available ? (
          <p className="empty">
            This browser isn’t saving notes. You can still download them from a sermon page.
          </p>
        ) : query.isPending || !drafts ? (
          <p className="empty" aria-busy="true">
            Loading your notes…
          </p>
        ) : rows.length === 0 ? (
          <p className="empty">
            No notes saved in this browser yet. Open a sermon, fill in a blank or write a
            reflection, and it will appear here.
          </p>
        ) : (
          <ol className="entries">
            {rows.map((row) => {
              const { id, draft, sermon, context } = row;
              const blanks = sermon ? listBlanks(getSermonDoc(sermon)) : [];
              const filled = blanks.filter((blank) => (draft.blanks[blank.id] ?? "").trim()).length;
              return (
                <li className="entry" key={id}>
                  {sermon?.cover ? (
                    <Link
                      to="/sermons/$sermonId"
                      params={{ sermonId: id }}
                      className="thumb"
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      <img src={sermon.cover} alt="" loading="lazy" width={480} height={300} />
                    </Link>
                  ) : (
                    <span className="thumb none" aria-hidden="true" />
                  )}
                  <div>
                    <div className="meta">
                      {sermon
                        ? `${formatDate(sermon.date, "short")} · ${sermon.scripture}`
                        : context?.date
                          ? [formatDate(context.date, "short"), context.scripture]
                              .filter(Boolean)
                              .join(" · ")
                          : "Saved on this device"}
                    </div>
                    <h2>
                      {sermon ? (
                        <Link to="/sermons/$sermonId" params={{ sermonId: id }}>
                          {sermon.title}
                        </Link>
                      ) : (
                        context?.title ||
                        (orphanReason === "removed" ? "Sermon no longer listed" : "Saved notes")
                      )}
                    </h2>
                    {!sermon ? (
                      <OrphanNotes draft={draft} context={context} reason={orphanReason} />
                    ) : null}
                    {sermon ? (
                      <div className="prog">
                        <span className="ticks" aria-hidden="true">
                          {blanks.map((blank) => (
                            <i
                              key={blank.id}
                              className={(draft.blanks[blank.id] ?? "").trim() ? "on" : undefined}
                            />
                          ))}
                        </span>
                        {filled} of {blanks.length} blanks filled
                      </div>
                    ) : null}
                    {draft.personal.trim() ? <blockquote>{draft.personal}</blockquote> : null}
                  </div>
                  <div className="row-acts">
                    {sermon ? (
                      <Link to="/sermons/$sermonId" params={{ sermonId: id }}>
                        Open
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="link-btn"
                      aria-label={`Download notes for ${sermon?.title || context?.title || "this sermon"}`}
                      onClick={() => {
                        downloadText(`${id}-notes.txt`, rowText(row, orphanReason));
                        toast(
                          `Notes for “${sermon?.title || context?.title || "this sermon"}” downloaded`,
                        );
                      }}
                    >
                      Download
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </PublicShell>
  );
}

/** Notes whose sermon is no longer in the public list: read them from this browser alone. */
function OrphanNotes({
  draft,
  context,
  reason,
}: {
  draft: VisitorDraft;
  context: NoteContext | null;
  reason: OrphanReason;
}) {
  const answers = orphanAnswers(draft, context);
  const outline = context ? fillOutline(context.outline, draft.blanks) : "";
  return (
    <div className="orphan">
      <p className="orphan-note">{ORPHAN_NOTICE[reason]}</p>
      {context && answers.length ? (
        <details className="orphan-outline">
          <summary>
            Read the outline with your{" "}
            {answers.length === 1 ? "answer" : `${answers.length} answers`}
          </summary>
          <pre>{outline}</pre>
        </details>
      ) : answers.length ? (
        <>
          <h3 className="orphan-h">Your answers</h3>
          <ol className="orphan-answers">
            {answers.map((answer, index) => (
              <li key={index}>{answer}</li>
            ))}
          </ol>
        </>
      ) : null}
    </div>
  );
}
