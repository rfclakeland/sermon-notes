import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/layout/SiteHeader";
import { MoreSermons } from "@/components/reader/MoreSermons";
import { SermonReader } from "@/components/reader/SermonReader";
import { LoadError, ReaderSkeleton, SermonNotFound } from "@/components/reader/States";
import { useSermons } from "@/lib/sermon/queries";

export const Route = createFileRoute("/sermons/$sermonId")({
  head: () => ({
    meta: [
      { title: "Sermon notes — Restoration Notes" },
      {
        name: "description",
        content: "Sermon notes from Restoration Fellowship Church of Lakeland.",
      },
      { property: "og:title", content: "Sermon notes — Restoration Notes" },
      {
        property: "og:description",
        content: "Follow along, fill in the blanks and keep your reflections.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SermonPage,
});

function SermonPage() {
  const { sermonId } = Route.useParams();
  const q = useSermons("public");
  const sermon = q.data?.sermons.find((s) => s.id === sermonId);
  const title =
    !q.isPending && !q.isError && sermon ? `${sermon.title} — Restoration Notes` : undefined;

  useEffect(() => {
    if (!title) return;

    const previousTitle = document.title;
    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    const previousOgTitle = ogTitle?.content;
    document.title = title;
    if (ogTitle) ogTitle.content = title;

    return () => {
      if (document.title === title) document.title = previousTitle;
      if (ogTitle?.content === title && previousOgTitle !== undefined) {
        ogTitle.content = previousOgTitle;
      }
    };
  }, [title]);

  const latestId = q.data?.sermons[0]?.id;
  return (
    <PublicShell>
      {q.isPending ? (
        <ReaderSkeleton />
      ) : q.isError ? (
        <LoadError onRetry={() => q.refetch()} />
      ) : !sermon ? (
        <SermonNotFound />
      ) : (
        <>
          <SermonReader key={sermon.id} sermon={sermon} isLatest={sermon.id === latestId} />
          <MoreSermons sermons={q.data.sermons} currentId={sermon.id} />
        </>
      )}
    </PublicShell>
  );
}
