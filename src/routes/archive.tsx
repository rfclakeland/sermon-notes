import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PublicShell } from "@/components/layout/SiteHeader";
import { CoverTile } from "@/components/reader/CoverTile";
import { LoadError } from "@/components/reader/States";
import { draftHasContent, loadDraft } from "@/lib/sermon/drafts";
import { PREVIEW_NOTICE } from "@/lib/sermon/export";
import { useSermons } from "@/lib/sermon/queries";
import { matchesSermon } from "@/lib/sermon/search";
import type { Sermon } from "@/lib/sermon/types";
import { sortNewestFirst } from "@/lib/sermon/validate";

const NO_SERMONS: Sermon[] = [];

export const Route = createFileRoute("/archive")({
  validateSearch: (search: { series?: unknown }): { series?: string } => {
    const series = typeof search.series === "string" ? search.series.trim() : "";
    return series ? { series } : {};
  },
  head: ({ match }) => {
    const title = `${match.search.series ?? "Past sermons"} — Restoration Notes`;
    return {
      meta: [
        { title },
        {
          name: "description",
          content:
            "Sermon outlines from Restoration Fellowship Church of Lakeland. Notes stay in this browser.",
        },
        { property: "og:title", content: title },
        {
          property: "og:description",
          content: "Search sermon outlines by title, Scripture, date, or series.",
        },
      ],
    };
  },
  component: Archive,
});

function Archive() {
  const { series } = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = useSermons("public");
  const [text, setText] = useState("");
  const [onlyNotes, setOnlyNotes] = useState(false);
  const sermons = query.data?.sermons ?? NO_SERMONS;
  const seriesOptions = useMemo(
    () =>
      [...new Set(sermons.flatMap((sermon) => (sermon.series ? [sermon.series] : [])))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [sermons],
  );
  const results = useMemo(
    () =>
      sortNewestFirst(
        sermons.filter((sermon) => {
          if (series && sermon.series !== series) return false;
          if (onlyNotes && !draftHasContent(loadDraft(sermon.id))) return false;
          return matchesSermon(sermon, text);
        }),
      ),
    [sermons, series, text, onlyNotes],
  );

  return (
    <PublicShell>
      <div className="wrap">
        <header className="page-head">
          <p className="eyebrow">{query.data ? `${results.length} sermons` : "Sermons"}</p>
          <h1>{series ?? "Past sermons"}</h1>
          <p className="lede">
            {PREVIEW_NOTICE} Every outline is ready to fill in. Sermons where you’ve saved notes in
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
              placeholder="Search by title, Scripture, date, or series"
            />
          </search>
          {series || seriesOptions.length > 0 ? (
            <label className="series-filter">
              Series
              <select
                value={series ?? ""}
                onChange={(event) => {
                  const selected = event.target.value;
                  void navigate({ search: selected ? { series: selected } : {} });
                }}
              >
                <option value="">All series</option>
                {series && !seriesOptions.includes(series) ? (
                  <option value={series}>{series}</option>
                ) : null}
                {seriesOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
          <LoadError inline onRetry={() => query.refetch()} />
        ) : results.length === 0 ? (
          <p className="empty">
            {text
              ? `No sermons match “${text}”${onlyNotes ? " among those with saved notes" : ""}.`
              : onlyNotes
                ? "You haven’t saved notes on any sermons in this view yet."
                : "No published sermons found."}
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
