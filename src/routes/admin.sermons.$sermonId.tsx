import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminTopBar } from "@/components/admin/AdminTopBar";
import { Button } from "@/components/ui/button";
import { SermonEditorScreen } from "@/components/admin/SermonEditorScreen";

export const Route = createFileRoute("/admin/sermons/$sermonId")({
  head: () => ({
    meta: [
      { title: "Edit sermon — Restoration Notes staff" },
      { name: "description", content: "Edit sermon notes, blanks and details." },
      { property: "og:title", content: "Edit sermon" },
      { property: "og:description", content: "Sermon editor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditRoute,
});

function EditRoute() {
  const { sermonId } = Route.useParams();
  return (
    <AdminGate>
      {(session) =>
        session.permissions.includes("notes.sermons.edit") ? (
          <SermonEditorScreen key={sermonId} sermonId={sermonId} session={session} />
        ) : (
          <>
            <AdminTopBar {...session} />
            <main className="mx-auto max-w-xl px-6 py-24">
              <h1 className="type-section">You don’t have permission to edit sermons</h1>
              <Button className="mt-6" asChild>
                <Link to="/admin">Back to sermons</Link>
              </Button>
            </main>
          </>
        )
      }
    </AdminGate>
  );
}
