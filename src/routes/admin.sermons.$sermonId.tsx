import { createFileRoute } from "@tanstack/react-router";
import { AdminGate } from "@/components/admin/AdminGate";
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
      {(signOut) => <SermonEditorScreen key={sermonId} sermonId={sermonId} onSignOut={signOut} />}
    </AdminGate>
  );
}
