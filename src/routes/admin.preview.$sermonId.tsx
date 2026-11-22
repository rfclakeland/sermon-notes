import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AdminGate, type AdminSession } from "@/components/admin/AdminGate";
import { AdminTopBar } from "@/components/admin/AdminTopBar";
import { SermonReader } from "@/components/reader/SermonReader";
import { ReaderSkeleton, SermonNotFound } from "@/components/reader/States";
import { Button } from "@/components/ui/button";
import { useSermons } from "@/lib/sermon/queries";

export const Route = createFileRoute("/admin/preview/$sermonId")({
  head: () => ({
    meta: [
      { title: "Preview — Restoration Notes admin (demo)" },
      { name: "description", content: "Preview of the saved sermon as visitors will see it." },
      { property: "og:title", content: "Sermon preview" },
      { property: "og:description", content: "Saved sermon preview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AdminGate>{(session) => <Preview session={session} />}</AdminGate>,
});

function Preview({ session }: { session: AdminSession }) {
  const { sermonId } = Route.useParams();
  const q = useSermons("staff");
  const sermon = q.data?.sermons.find((s) => s.id === sermonId);
  return (
    <div className="min-h-screen">
      <div className="no-print sticky top-0 z-30">
        <AdminTopBar {...session} />
        <div className="border-b border-border bg-foreground text-background">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 md:px-8">
            <p className="text-[15px]">
              <strong>Preview</strong> · last saved version, as visitors see it. Typing here isn’t
              saved.
            </p>
            <Button variant="secondary" size="sm" asChild>
              {session.permissions.includes("notes.sermons.edit") ? (
                <Link to="/admin/sermons/$sermonId" params={{ sermonId }}>
                  <ArrowLeft aria-hidden /> Editor
                </Link>
              ) : (
                <Link to="/admin">
                  <ArrowLeft aria-hidden /> Sermons
                </Link>
              )}
            </Button>
          </div>
        </div>
      </div>
      <div>
        {q.isPending ? (
          <ReaderSkeleton />
        ) : !sermon ? (
          <SermonNotFound />
        ) : (
          <SermonReader key={sermon.id} sermon={sermon} preview />
        )}
      </div>
    </div>
  );
}
