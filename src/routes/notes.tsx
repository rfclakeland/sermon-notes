import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PublicShell } from "@/components/layout/SiteHeader";
import { LoadError } from "@/components/reader/States";
import { getSermonDoc, listBlanks } from "@/lib/sermon/delta";
import { draftHasContent, listDraftIds, loadDraft, storageAvailable } from "@/lib/sermon/drafts";
import { buildNotesText, downloadText, formatDate, SAMPLE_NOTICE } from "@/lib/sermon/export";
import { buildBackup, restoreBackup } from "@/lib/sermon/notes-backup";
import { useSermons } from "@/lib/sermon/queries";
import type { Sermon, VisitorDraft } from "@/lib/sermon/types";

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
  const [drafts, setDrafts] = useState<Record<string, VisitorDraft> | null>(null);
  const [available, setAvailable] = useState(true);

  const refresh = () => {
    const next: Record<string, VisitorDraft> = {};
    for (const id of listDraftIds()) {
      const draft = loadDraft(id);
      if (draftHasContent(draft)) next[id] = draft;
    }
    setDrafts(next);
  };

  useEffect(() => {
    setAvailable(storageAvailable());
    refresh();
  }, []);

  const sermons = query.data?.sermons ?? [];
  const rows = drafts
    ? Object.entries(drafts)
        .map(([id, draft]) => ({ id, draft, sermon: sermons.find((item) => item.id === id) }))
        .sort((a, b) => (b.sermon?.date ?? "").localeCompare(a.sermon?.date ?? ""))
    : [];

  const downloadJournal = () => {
    const parts = rows
      .filter((row): row is { id: string; draft: VisitorDraft; sermon: Sermon } => !!row.sermon)
      .map((row) => buildNotesText(row.sermon, row.draft, false));
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

        {!available ? (
          <p className="empty">
            This browser isn’t saving notes. You can still download them from a sermon page.
          </p>
        ) : query.isError ? (
          <LoadError onRetry={() => query.refetch()} />
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
            {rows.map(({ id, draft, sermon }) => {
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
                    <span className="thumb" />
                  )}
                  <div>
                    <div className="meta">
                      {sermon
                        ? `${formatDate(sermon.date, "short")} · ${sermon.scripture}`
                        : "Saved on this device"}
                    </div>
                    <h2>
                      {sermon ? (
                        <Link to="/sermons/$sermonId" params={{ sermonId: id }}>
                          {sermon.title}
                        </Link>
                      ) : (
                        "Sermon no longer listed"
                      )}
                    </h2>
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
                    {sermon ? (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => {
                          downloadText(`${id}-notes.txt`, buildNotesText(sermon, draft, false));
                          toast(`Notes for “${sermon.title}” downloaded`);
                        }}
                      >
                        Download
                      </button>
                    ) : null}
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
