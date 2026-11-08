import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PublicShell } from "@/components/layout/SiteHeader";
import { CoverTile } from "@/components/reader/CoverTile";
import { LoadError } from "@/components/reader/States";
import { SAMPLE_NOTICE } from "@/lib/sermon/export";
import { draftHasContent, loadDraft } from "@/lib/sermon/drafts";
import { useSermons } from "@/lib/sermon/queries";
import { matchesSermon } from "@/lib/sermon/search";
import type { Sermon } from "@/lib/sermon/types";

const NO_SERMONS: Sermon[] = [];

export const Route = createFileRoute("/archive")({
  head: () => ({
    meta: [
      { title: "Past sermons — Restoration Notes" },
      {
        name: "description",
        content:
          "Sample sermon outlines from Restoration Fellowship Church of Lakeland. Notes stay in this browser.",
      },
      { property: "og:title", content: "Past sermons — Restoration Notes" },
      {
        property: "og:description",
        content: "Search sample sermon outlines by title, Scripture, or date.",
      },
    ],
  }),
  component: Archive,
});

function Archive() {
  const query = useSermons("public");
  const [text, setText] = useState("");
  const [onlyNotes, setOnlyNotes] = useState(false);
  const sermons = query.data?.sermons ?? NO_SERMONS;
  const results = useMemo(
    () =>
      sermons.filter((sermon) => {
        if (onlyNotes && !draftHasContent(loadDraft(sermon.id))) return false;
        return matchesSermon(sermon, text);
      }),
    [sermons, text, onlyNotes],
  );

  return (
    <PublicShell>
      <div className="wrap">
        <header className="page-head">
          <p className="eyebrow">{query.data ? `${sermons.length} sermons` : "Sermons"}</p>
          <h1>Past sermons</h1>
          <p className="lede">
            {SAMPLE_NOTICE} Every outline is ready to fill in. Sermons where you’ve saved notes in
            this browser are marked.
          </p>
        </header>
        <div className="finder">
          <search>
            <input
              className="search"
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-label="Search sermons"
              placeholder="Search by title, Scripture, or date"
            />
          </search>
          <div className="filters" role="group" aria-label="Filter">
            <button
              type="button"
              className={onlyNotes ? undefined : "on"}
              aria-pressed={!onlyNotes}
              onClick={() => setOnlyNotes(false)}
            >
              All
            </button>
            <button
              type="button"
              className={onlyNotes ? "on" : undefined}
              aria-pressed={onlyNotes}
              onClick={() => setOnlyNotes(true)}
            >
              My notes saved
            </button>
          </div>
        </div>
        {query.isPending ? (
          <div className="grid2" aria-busy="true" aria-label="Loading sermons">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="tile" />
            ))}
          </div>
        ) : query.isError ? (
          <LoadError onRetry={() => query.refetch()} />
        ) : results.length === 0 ? (
          <p className="empty">
            {text
              ? `No sermons match “${text}”${onlyNotes ? " among those with saved notes" : ""}.`
              : "You haven’t saved notes on any sermon in this browser yet."}
          </p>
        ) : (
          <div className="grid2">
            {results.map((sermon) => (
              <CoverTile key={sermon.id} sermon={sermon} />
            ))}
          </div>
        )}
      </div>
    </PublicShell>
  );
}
