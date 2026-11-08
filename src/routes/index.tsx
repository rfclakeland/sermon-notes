import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PublicShell } from "@/components/layout/SiteHeader";
import { MoreSermons } from "@/components/reader/MoreSermons";
import { SermonReader } from "@/components/reader/SermonReader";
import { LoadError, ReaderSkeleton, StateMessage } from "@/components/reader/States";
import { useSermons } from "@/lib/sermon/queries";
import { sermonFromHash } from "@/lib/sermon/search";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "This Sunday’s sermon notes — Restoration Notes" },
      {
        name: "description",
        content:
          "Follow along with this week’s sermon at Restoration Fellowship Church of Lakeland and keep your notes on your device.",
      },
      { property: "og:title", content: "This Sunday’s sermon notes — Restoration Notes" },
      {
        property: "og:description",
        content: "Fill in the blanks, write reflections, and save or email your sermon notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Latest,
});

function Latest() {
  const navigate = useNavigate();
  const q = useSermons();

  useEffect(() => {
    const go = () => {
      const id = sermonFromHash(window.location.hash);
      if (id) navigate({ to: "/sermons/$sermonId", params: { sermonId: id }, replace: true });
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [navigate]);

  const latest = q.data?.sermons[0];
  return (
    <PublicShell>
      {q.isPending ? (
        <ReaderSkeleton />
      ) : q.isError ? (
        <LoadError onRetry={() => q.refetch()} />
      ) : !latest ? (
        <StateMessage
          title="No sermons yet"
          body="Notes for Sunday’s message will appear here once they’re posted."
        />
      ) : (
        <>
          <SermonReader key={latest.id} sermon={latest} isLatest />
          <MoreSermons sermons={q.data.sermons} currentId={latest.id} />
        </>
      )}
    </PublicShell>
  );
}
