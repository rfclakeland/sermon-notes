import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Eye, Loader2, Plus, Upload } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminTopBar } from "@/components/admin/AdminTopBar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { downloadText, formatDate } from "@/lib/sermon/export";
import { useSermons } from "@/lib/sermon/queries";
import { ConflictError, sermonService } from "@/lib/sermon/service";
import type { SermonCollection } from "@/lib/sermon/types";
import { validateCollection } from "@/lib/sermon/validate";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Sermons — Restoration Notes staff" },
      {
        name: "description",
        content: "Manage sermon notes for Restoration Fellowship Church of Lakeland.",
      },
      { property: "og:title", content: "Restoration Notes admin (demo)" },
      { property: "og:description", content: "Create and edit sermon notes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AdminGate>{(signOut) => <AdminHome onSignOut={signOut} />}</AdminGate>,
});

type Review = { incoming: SermonCollection; added: string[]; updated: string[]; removed: string[] };

function AdminHome({ onSignOut }: { onSignOut: () => void }) {
  const q = useSermons("staff");
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);

  const backup = () => {
    if (!q.data) return;
    const payload = {
      format: "restoration-notes-v1",
      exportedAt: new Date().toISOString(),
      ...q.data,
    };
    downloadText(
      `restoration-sermons-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
    toast.success("Backup downloaded");
  };

  const onFile = async (f: File | undefined) => {
    if (!f || !q.data) return;
    try {
      if (f.size > 25 * 1024 * 1024) throw new Error("That file is too large for a sermon backup.");
      const incoming = validateCollection(JSON.parse(await f.text()));
      const cur = new Set(q.data.sermons.map((s) => s.id));
      const next = new Set(incoming.sermons.map((s) => s.id));
      setReview({
        incoming,
        added: [...next].filter((id) => !cur.has(id)),
        updated: [...next].filter((id) => cur.has(id)),
        removed: [...cur].filter((id) => !next.has(id)),
      });
    } catch (e) {
      toast.error("Couldn’t read that backup", {
        description: e instanceof SyntaxError ? "The file isn’t valid JSON." : (e as Error).message,
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const applyImport = async () => {
    if (!review || !q.data) return;
    setBusy(true);
    try {
      const res = await sermonService.save(review.incoming.sermons, q.data.revision);
      qc.setQueryData(["sermons", "staff"], res);
      toast.success(`Collection replaced · ${res.sermons.length} sermons`);
      setReview(null);
    } catch (e) {
      toast.error(
        e instanceof ConflictError
          ? "The collection changed elsewhere. Reload and import again."
          : (e as Error).message,
      );
      if (e instanceof ConflictError) qc.invalidateQueries({ queryKey: ["sermons", "staff"] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AdminTopBar onSignOut={onSignOut} />
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-12 md:px-8 md:pt-20">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="type-display">Sermons</h1>
            <p className="mt-3 text-[17px] text-muted-foreground">
              {q.data
                ? `${q.data.sermons.length} sermons · revision ${q.data.revision}`
                : "Loading…"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Backup</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-xl p-1.5">
                <DropdownMenuItem className="h-11 gap-3 rounded-lg text-[15px]" onSelect={backup}>
                  <Download className="size-[18px]" /> Download JSON backup
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="h-11 gap-3 rounded-lg text-[15px]"
                  onSelect={() => fileRef.current?.click()}
                >
                  <Upload className="size-[18px]" /> Import JSON backup…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button asChild>
              <Link to="/admin/sermons/$sermonId" params={{ sermonId: "new" }}>
                <Plus aria-hidden /> New sermon
              </Link>
            </Button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />

        {q.isPending ? (
          <div className="mt-12 space-y-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : q.isError ? (
          <div className="mt-12">
            <p className="text-[17px]">Couldn’t load sermons.</p>
            <Button className="mt-4" onClick={() => q.refetch()}>
              Try again
            </Button>
          </div>
        ) : q.data.sermons.length === 0 ? (
          <div className="mt-16">
            <p className="type-section">No sermons yet</p>
            <p className="mt-2 text-[17px] text-muted-foreground">
              Create the first one, or import a backup.
            </p>
          </div>
        ) : (
          <ul className="mt-12 grid gap-3">
            {q.data.sermons.map((s) => (
              <li
                key={s.id}
                className="surface surface-hover flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6"
              >
                <Link
                  to="/admin/sermons/$sermonId"
                  params={{ sermonId: s.id }}
                  className="group flex min-w-0 flex-1 items-center gap-5 rounded-lg"
                >
                  {s.cover ? (
                    <img
                      src={s.cover}
                      alt=""
                      width={128}
                      height={72}
                      loading="lazy"
                      className="hidden aspect-[16/9] w-28 shrink-0 rounded-lg object-cover sm:block"
                    />
                  ) : (
                    <span
                      className="hidden aspect-[16/9] w-28 shrink-0 rounded-lg bg-muted sm:block"
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-display text-[21px] font-semibold tracking-tight group-hover:text-primary">
                      {s.title}
                    </span>
                    <span className="mt-0.5 block text-[15px] text-muted-foreground">
                      {formatDate(s.date, "short")} · {s.speaker || "No speaker"} ·{" "}
                      {s.scripture || "No Scripture"}
                      {s.status === "draft" ? (
                        <span className="ml-2 font-semibold text-[#7a5c24]">· Draft</span>
                      ) : null}
                      {s.status === "published" &&
                      s.id === q.data.sermons.find((item) => item.status === "published")?.id ? (
                        <span className="ml-2 font-semibold">· Latest</span>
                      ) : null}
                    </span>
                  </span>
                </Link>
                <div className="flex gap-1">
                  <Button variant="ghost" asChild>
                    <Link to="/admin/preview/$sermonId" params={{ sermonId: s.id }}>
                      <Eye aria-hidden /> Preview
                    </Link>
                  </Button>
                  <Button variant="soft" asChild>
                    <Link to="/admin/sermons/$sermonId" params={{ sermonId: s.id }}>
                      Edit
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-8 text-[15px] text-muted-foreground">
          Drafts stay off the public site. Publishing a sermon is what makes it visible to visitors.
        </p>
      </main>

      <AlertDialog open={!!review} onOpenChange={(o) => !o && !busy && setReview(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the sermon collection?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-[15px] leading-relaxed">
                <p>
                  The backup has {review?.incoming.sermons.length} sermons. Importing replaces
                  everything currently saved:
                </p>
                <ul className="space-y-1 text-foreground">
                  <li>
                    <strong>{review?.added.length}</strong> new
                  </li>
                  <li>
                    <strong>{review?.updated.length}</strong> replaced (same id)
                  </li>
                  <li>
                    <strong>{review?.removed.length}</strong> removed
                    {review?.removed.length ? `: ${review.removed.join(", ")}` : ""}
                  </li>
                </ul>
                <p>
                  Sermon and blank ids are kept as-is, so visitors’ saved notes still match. Visitor
                  notes are not touched.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-full" disabled={busy}>
              Cancel
            </AlertDialogCancel>
            <Button onClick={applyImport} disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Replace collection
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
