import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  ExternalLink,
  FileUp,
  ImagePlus,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSermonDoc } from "@/lib/sermon/delta";
import { docxToHtml, resizeCover } from "@/lib/sermon/files";
import { useSermons } from "@/lib/sermon/queries";
import { ConflictError, sermonService } from "@/lib/sermon/service";
import { deltaToTiptap, tiptapToDelta } from "@/lib/sermon/tiptap-adapter";
import type { Sermon, SermonStatus } from "@/lib/sermon/types";
import { looksLikeEmbeddedVerse, SERMON_ID_RE, slugify } from "@/lib/sermon/validate";
import { cn } from "@/lib/utils";
import { AdminTopBar } from "./AdminTopBar";
import { EditorToolbar } from "./editor/EditorToolbar";
import {
  convertUnderlinesToBlanks,
  removeBlank,
  sermonExtensions,
  updateBlank,
  type BlankStorage,
} from "./editor/extensions";

type Meta = {
  id: string;
  title: string;
  date: string;
  speaker: string;
  scripture: string;
  reference: string;
  cover: string;
  status: SermonStatus;
};
type SaveState = "idle" | "saving" | "saved" | "error";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function SermonEditorScreen({
  sermonId,
  onSignOut,
}: {
  sermonId: string;
  onSignOut: () => void;
}) {
  const q = useSermons("staff");
  if (q.isPending)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2
          className="size-6 animate-spin text-muted-foreground"
          aria-label="Loading sermon"
        />
      </div>
    );
  if (q.isError)
    return (
      <div className="mx-auto max-w-xl px-6 py-24">
        <p className="type-section">Couldn’t load sermons</p>
        <Button className="mt-6" onClick={() => q.refetch()}>
          Try again
        </Button>
      </div>
    );
  const isNew = sermonId === "new";
  const sermon = q.data.sermons.find((s) => s.id === sermonId);
  if (!isNew && !sermon)
    return (
      <div className="mx-auto max-w-xl px-6 py-24">
        <p className="type-section">That sermon doesn’t exist</p>
        <Button className="mt-6" asChild>
          <Link to="/admin">Back to sermons</Link>
        </Button>
      </div>
    );
  return <EditorInner original={sermon ?? null} onSignOut={onSignOut} />;
}

function EditorInner({ original, onSignOut }: { original: Sermon | null; onSignOut: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isNew = !original;

  const initialMeta: Meta = useMemo(
    () => ({
      id: original?.id ?? "",
      title: original?.title ?? "",
      date: original?.date ?? todayIso(),
      speaker: original?.speaker ?? "",
      scripture: original?.scripture ?? "",
      reference: original?.reference ?? "",
      cover: original?.cover ?? "",
      status: original?.status ?? "draft",
    }),
    [original],
  );
  const initialDoc = useMemo(
    () => (original ? getSermonDoc(original) : { ops: [{ insert: "\n" }] }),
    [original],
  );

  const [meta, setMeta] = useState<Meta>(initialMeta);
  const [idTouched, setIdTouched] = useState(false);
  const baseMeta = useRef(JSON.stringify(initialMeta));
  const baseDoc = useRef(JSON.stringify(initialDoc));
  const [docJson, setDocJson] = useState(baseDoc.current);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [editingBlank, setEditingBlank] = useState<{
    pos: number;
    answer: string;
    multiline: boolean;
  } | null>(null);
  const [confirmImport, setConfirmImport] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const skipBlock = useRef(false);
  const docxRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const editor = useEditor({
    extensions: sermonExtensions(),
    content: deltaToTiptap(initialDoc),
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: "prose-sermon", "aria-label": "Sermon notes document" } },
    onUpdate: ({ editor }) => setDocJson(JSON.stringify(tiptapToDelta(editor.getJSON()))),
  });

  useEffect(() => {
    if (!editor) return;
    (editor.storage as unknown as { blank: BlankStorage }).blank.onEdit = (pos) => {
      const n = editor.state.doc.nodeAt(pos);
      if (n)
        setEditingBlank({
          pos,
          answer: String(n.attrs["answer"] ?? ""),
          multiline: !!n.attrs["multiline"],
        });
    };
  }, [editor]);

  useEffect(() => {
    const el = titleRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [meta.title]);

  const dirty = JSON.stringify(meta) !== baseMeta.current || docJson !== baseDoc.current;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const blocker = useBlocker({
    shouldBlockFn: () => dirtyRef.current && !skipBlock.current,
    enableBeforeUnload: () => dirtyRef.current,
    withResolver: true,
  });

  const set = (k: keyof Meta) => (v: string) => {
    setMeta((m) => {
      const next = { ...m, [k]: v };
      if (k === "title" && isNew && !idTouched) next.id = slugify(v);
      return next;
    });
    if (saveState === "saved") setSaveState("idle");
  };

  const save = async (opts?: { overwrite?: boolean }): Promise<Sermon | null> => {
    if (!editor) return null;
    setError(null);
    if (!meta.title.trim()) {
      setError("Add a title before saving.");
      titleRef.current?.focus();
      return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) return (setError("Choose a sermon date."), null);
    if (meta.status !== "draft" && meta.status !== "published")
      return (setError("Choose draft or published."), null);
    if (looksLikeEmbeddedVerse(meta.scripture) || looksLikeEmbeddedVerse(meta.reference)) {
      return (
        setError(
          "Enter a passage reference, such as Mark 2:1–12. Don’t paste copyrighted translation text.",
        ),
        null
      );
    }
    const latest = opts?.overwrite
      ? await sermonService.list()
      : qc.getQueryData<{ sermons: Sermon[]; revision: number }>(["sermons", "staff"]);
    if (!latest) return null;
    if (isNew && (!SERMON_ID_RE.test(meta.id) || latest.sermons.some((s) => s.id === meta.id))) {
      setError(
        !SERMON_ID_RE.test(meta.id)
          ? "The link id can use lowercase letters, numbers and hyphens."
          : "Another sermon already uses that link id.",
      );
      return null;
    }
    const doc = tiptapToDelta(editor.getJSON());
    const record: Sermon = {
      ...(original ?? { context: "", lead: "", points: [] }),
      id: meta.id,
      title: meta.title.trim(),
      date: meta.date,
      speaker: meta.speaker.trim(),
      scripture: meta.scripture.trim(),
      reference: meta.reference.trim(),
      status: meta.status,
      content: doc,
    };
    if (meta.cover) record.cover = meta.cover;
    else delete record.cover;
    const sermons = latest.sermons.some((s) => s.id === record.id)
      ? latest.sermons.map((s) => (s.id === record.id ? record : s))
      : [record, ...latest.sermons];
    setSaveState("saving");
    try {
      const res = await sermonService.save(sermons, latest.revision);
      qc.setQueryData(["sermons", "staff"], res);
      void qc.invalidateQueries({ queryKey: ["sermons", "public"] });
      baseMeta.current = JSON.stringify(meta);
      baseDoc.current = JSON.stringify(doc);
      setDocJson(baseDoc.current);
      setSaveState("saved");
      setConflict(false);
      if (isNew) {
        skipBlock.current = true;
        navigate({
          to: "/admin/sermons/$sermonId",
          params: { sermonId: record.id },
          replace: true,
        });
      }
      return record;
    } catch (e) {
      setSaveState("error");
      if (e instanceof ConflictError) setConflict(true);
      else setError(`${(e as Error).message} Your changes are still here — try again.`);
      return null;
    }
  };

  const saveAndPreview = async () => {
    const r = await save();
    if (r) {
      skipBlock.current = true;
      navigate({ to: "/admin/preview/$sermonId", params: { sermonId: r.id } });
    }
  };

  const reloadLatest = async () => {
    skipBlock.current = true;
    setConflict(false);
    await qc.invalidateQueries({ queryKey: ["sermons", "staff"] });
    window.location.reload();
  };

  const importDocx = async (file?: File) => {
    if (!file || !editor) return;
    try {
      const html = await docxToHtml(file);
      if (editor.getText().trim()) setConfirmImport(html);
      else applyImport(html);
    } catch (e) {
      toast.error("Couldn’t import that document", { description: (e as Error).message });
    } finally {
      if (docxRef.current) docxRef.current.value = "";
    }
  };
  const applyImport = (html: string) => {
    editor?.chain().focus().setContent(html, { emitUpdate: true }).run();
    setConfirmImport(null);
    const u = editor?.getHTML().match(/<u>/g)?.length ?? 0;
    toast.success("Word document imported", {
      description: u
        ? `${u} underlined passages found. Use “Convert underlines” to make them blanks.`
        : "Undo reverts the import.",
    });
  };

  const convert = () => {
    if (!editor) return;
    const n = convertUnderlinesToBlanks(editor);
    if (n)
      toast.success(`${n} underlined ${n === 1 ? "passage" : "passages"} converted to blanks`, {
        description: "Undo reverts the conversion.",
      });
    else toast("No underlined text found");
  };

  const onCover = async (file?: File) => {
    if (!file) return;
    setCoverBusy(true);
    try {
      const jpeg = await resizeCover(file);
      const { cover } = await sermonService.uploadCover(jpeg);
      set("cover")(cover);
      toast.success("Cover ready", {
        description: `Resized to JPEG · ${(jpeg.size / 1024).toFixed(0)} KB`,
      });
    } catch (e) {
      toast.error("Couldn’t use that image", { description: (e as Error).message });
    } finally {
      setCoverBusy(false);
      if (coverRef.current) coverRef.current.value = "";
    }
  };

  const duplicate = async () => {
    if (!editor || !original) return;
    if (dirty) {
      setError("Save this sermon before duplicating it.");
      return;
    }
    const latest = qc.getQueryData<{ sermons: Sermon[]; revision: number }>(["sermons", "staff"]);
    if (!latest) return;
    const base = slugify(`${original.title}-copy`) || "sermon-copy";
    let id = base;
    let n = 2;
    while (latest.sermons.some((sermon) => sermon.id === id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    const copy: Sermon = {
      ...original,
      id,
      title: `Copy of ${original.title}`.slice(0, 200),
      status: "draft",
      content: tiptapToDelta(editor.getJSON()),
    };
    setSaveState("saving");
    try {
      const res = await sermonService.save([copy, ...latest.sermons], latest.revision);
      qc.setQueryData(["sermons", "staff"], res);
      skipBlock.current = true;
      toast.success("Duplicated as a draft");
      navigate({ to: "/admin/sermons/$sermonId", params: { sermonId: id } });
    } catch (e) {
      setSaveState("error");
      if (e instanceof ConflictError) setConflict(true);
      else setError((e as Error).message);
    }
  };

  const remove = async () => {
    if (!original) return;
    const latest = await sermonService.list();
    setSaveState("saving");
    try {
      const res = await sermonService.save(
        latest.sermons.filter((sermon) => sermon.id !== original.id),
        latest.revision,
      );
      qc.setQueryData(["sermons", "staff"], res);
      skipBlock.current = true;
      toast.success("Sermon deleted");
      navigate({ to: "/admin" });
    } catch (e) {
      setSaveState("error");
      if (e instanceof ConflictError) setConflict(true);
      else setError((e as Error).message);
    } finally {
      setConfirmDelete(false);
    }
  };

  const status =
    saveState === "saving" ? (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Saving…
      </span>
    ) : saveState === "error" ? (
      <span className="inline-flex items-center gap-1.5 font-semibold text-destructive">
        <CircleAlert className="size-4" aria-hidden /> Not saved
      </span>
    ) : dirty ? (
      <span className="inline-flex items-center gap-2 font-semibold text-foreground">
        <span className="size-2 rounded-full bg-primary" aria-hidden /> Unsaved changes
      </span>
    ) : saveState === "saved" ? (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Check className="size-4 text-primary" aria-hidden /> Saved
      </span>
    ) : isNew ? (
      <span className="text-muted-foreground">New sermon</span>
    ) : (
      <span className="text-muted-foreground">No changes</span>
    );

  const field = "mt-1.5 h-11 w-full rounded-xl border border-input bg-paper px-3.5 text-[16px]";
  const label = "block text-[14px] font-semibold";

  return (
    <div className="min-h-screen">
      <AdminTopBar onSignOut={onSignOut} />

      {/* Action bar */}
      <div className="sticky top-[61px] z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/admin" aria-label="Back to sermons">
                <ArrowLeft aria-hidden />
              </Link>
            </Button>
            <p className="truncate text-[15px]" aria-live="polite">
              {status}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {!isNew && (
              <Button variant="ghost" className="hidden sm:inline-flex" asChild>
                <a
                  href={`/admin/preview/${original!.id}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Opens the last saved version in a new tab"
                >
                  <ExternalLink aria-hidden /> Preview saved
                </a>
              </Button>
            )}
            {!isNew ? (
              <Button
                variant="ghost"
                className="px-3 sm:px-5"
                onClick={duplicate}
                disabled={saveState === "saving"}
              >
                Duplicate<span className="hidden sm:inline">&nbsp;as draft</span>
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="px-3 sm:px-5"
              onClick={saveAndPreview}
              disabled={saveState === "saving"}
            >
              Save & preview
            </Button>
            <Button
              className="px-3 sm:px-5"
              onClick={() => save()}
              disabled={saveState === "saving" || (!dirty && !isNew)}
            >
              Save<span className="hidden sm:inline">&nbsp;sermon</span>
            </Button>
          </div>
        </div>
      </div>

      {(error || conflict) && (
        <div className="mx-auto max-w-7xl px-4 pt-4 md:px-8">
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-paper px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-[15px]">
              {conflict ? (
                <>
                  <strong>Someone saved changes elsewhere.</strong> Your edits are still here.
                  Overwrite with your version, or reload the latest and lose your edits.
                </>
              ) : (
                error
              )}
            </p>
            {conflict && (
              <div className="flex shrink-0 gap-2">
                <Button variant="ghost" onClick={reloadLatest}>
                  Reload latest
                </Button>
                <Button variant="destructive" onClick={() => save({ overwrite: true })}>
                  Overwrite
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-24 pt-8 md:px-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14 lg:pt-12">
        <div className="mx-auto w-full min-w-0 max-w-[50rem]">
          <textarea
            ref={titleRef}
            rows={1}
            value={meta.title}
            onChange={(e) => set("title")(e.target.value)}
            placeholder="Sermon title"
            aria-label="Sermon title"
            className="type-display block w-full resize-none overflow-hidden bg-transparent rounded-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          />
          <p className="mt-3 text-[16px] text-muted-foreground">
            {[meta.speaker, meta.scripture].filter(Boolean).join(" · ") ||
              "Add speaker and Scripture in Details"}
          </p>

          <div className="sticky top-[122px] z-10 mt-8 sm:top-[123px]">
            {editor && <EditorToolbar editor={editor} onConvertUnderlines={convert} />}
          </div>

          <div className="sermon-editor mt-8">
            {editor ? (
              <EditorContent editor={editor} />
            ) : (
              <div className="h-64 animate-pulse rounded-2xl bg-muted" />
            )}
          </div>
        </div>

        {/* Details inspector */}
        <aside
          className="space-y-6 lg:sticky lg:top-[140px] lg:self-start"
          aria-label="Sermon details"
        >
          <details open className="group surface p-5 lg:[&>summary]:pointer-events-none">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[17px] font-semibold">
              Details{" "}
              <span className="text-[14px] font-normal text-muted-foreground lg:hidden group-open:hidden">
                Show
              </span>
            </summary>
            <div className="mt-3 space-y-4">
              <label className={label}>
                Sermon date
                <input
                  type="date"
                  className={field}
                  value={meta.date}
                  onChange={(e) => set("date")(e.target.value)}
                />
              </label>
              <label className={label}>
                Status
                <select
                  className={field}
                  value={meta.status}
                  onChange={(e) =>
                    set("status")(e.target.value === "published" ? "published" : "draft")
                  }
                >
                  <option value="draft">Draft — hidden from visitors</option>
                  <option value="published">Published</option>
                </select>
                <span className="mt-1 block text-[13px] font-normal text-muted-foreground">
                  New sermons start as drafts. Set Published to show one on the public site.
                </span>
              </label>
              <label className={label}>
                Speaker
                <input
                  className={field}
                  value={meta.speaker}
                  onChange={(e) => set("speaker")(e.target.value)}
                  placeholder="Pastor"
                />
              </label>
              <label className={label}>
                Passage reference
                <input
                  className={field}
                  value={meta.scripture}
                  onChange={(e) => set("scripture")(e.target.value)}
                  placeholder="Mark 2:1–12"
                />
                <span className="mt-1 block text-[13px] font-normal text-muted-foreground">
                  A reference only. Don’t paste copyrighted Bible translation text.
                </span>
              </label>
              <label className={label}>
                Bible Gateway search
                <input
                  className={field}
                  value={meta.reference}
                  onChange={(e) => set("reference")(e.target.value)}
                  placeholder="Mark 2:1-12"
                />
                <span className="mt-1 block text-[13px] font-normal text-muted-foreground">
                  Used for the outbound passage link.
                </span>
              </label>
              <label className={label}>
                Link id
                <input
                  className={cn(field, !isNew && "bg-muted text-muted-foreground")}
                  value={meta.id}
                  readOnly={!isNew}
                  onChange={(e) => {
                    setIdTouched(true);
                    set("id")(e.target.value.toLowerCase());
                  }}
                />
                <span className="mt-1 block text-[13px] font-normal text-muted-foreground">
                  {isNew
                    ? "Shared links use /sermons/" + (meta.id || "…")
                    : "Locked so existing links and visitor notes keep working."}
                </span>
              </label>
            </div>
          </details>

          <section className="surface p-5" aria-labelledby="cover-h">
            <h2 id="cover-h" className="text-[17px] font-semibold">
              Cover image
            </h2>
            <p className="mt-1 text-[14px] text-muted-foreground">
              Optional · wide 16:9 works best · JPG, PNG or WebP up to 15 MB.
            </p>
            {meta.cover ? (
              <img
                src={meta.cover}
                alt="Cover preview"
                className="mt-4 aspect-[16/9] w-full rounded-xl object-cover"
              />
            ) : (
              <div className="mt-4 flex aspect-[16/9] w-full items-center justify-center rounded-xl border border-dashed border-input text-[14px] text-muted-foreground">
                No cover — title leads the page
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => coverRef.current?.click()}
                disabled={coverBusy}
              >
                {coverBusy ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <ImagePlus aria-hidden />
                )}{" "}
                {meta.cover ? "Replace" : "Upload"}
              </Button>
              {meta.cover && (
                <Button variant="ghost" size="sm" onClick={() => set("cover")("")}>
                  <Trash2 aria-hidden /> Remove
                </Button>
              )}
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              Resized to a JPEG at most 1920px on the long edge and 2 MB, then stored with this
              preview.
            </p>
            {!isNew ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-4"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 aria-hidden /> Delete sermon
              </Button>
            ) : null}
            <input
              ref={coverRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => onCover(e.target.files?.[0])}
            />
          </section>

          <section className="surface p-5" aria-labelledby="import-h">
            <h2 id="import-h" className="text-[17px] font-semibold">
              Import from Word
            </h2>
            <p className="mt-1 text-[14px] text-muted-foreground">
              .docx up to 5 MB. Keeps headings, bold and underlined answers. You can also paste
              straight from Word.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => docxRef.current?.click()}
            >
              <FileUp aria-hidden /> Choose .docx
            </Button>
            <input
              ref={docxRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => importDocx(e.target.files?.[0])}
            />
          </section>
        </aside>
      </div>

      {editor && (
        <BlankDialog editor={editor} state={editingBlank} onClose={() => setEditingBlank(null)} />
      )}

      <AlertDialog open={!!confirmImport} onOpenChange={(o) => !o && setConfirmImport(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the current notes?</AlertDialogTitle>
            <AlertDialogDescription>
              The Word document will replace everything in the editor. Existing blanks are removed,
              so visitors’ answers for them won’t match. You can undo right after.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-full">Cancel</AlertDialogCancel>
            <Button onClick={() => confirmImport && applyImport(confirmImport)}>
              Replace notes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(false)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this sermon?</AlertDialogTitle>
            <AlertDialogDescription>
              “{original?.title}” will be removed from the preview. Visitor notes already saved in a
              browser stay on that device, but they won’t have a sermon to open.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-full">Keep sermon</AlertDialogCancel>
            <Button variant="destructive" onClick={remove}>
              Delete sermon
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this sermon. They’ll be lost if you leave now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-full" onClick={() => blocker.reset?.()}>
              Keep editing
            </AlertDialogCancel>
            <Button variant="destructive" onClick={() => blocker.proceed?.()}>
              Discard changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BlankDialog({
  editor,
  state,
  onClose,
}: {
  editor: Editor;
  state: { pos: number; answer: string; multiline: boolean } | null;
  onClose: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [multiline, setMultiline] = useState(false);
  useEffect(() => {
    if (state) {
      setAnswer(state.answer);
      setMultiline(state.multiline);
    }
  }, [state]);
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{multiline ? "Note area" : "Blank"}</DialogTitle>
          <DialogDescription>
            Visitors fill this in. The answer appears only when they choose Reveal answers.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (state) updateBlank(editor, state.pos, { answer: answer.trim(), multiline });
            onClose();
          }}
          className="space-y-5"
        >
          <label className="block text-[14px] font-semibold">
            Model answer
            <input
              autoFocus
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Leave empty for free response"
              className="mt-1.5 h-12 w-full rounded-xl border border-input bg-paper px-4 text-[16px] font-normal"
            />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-4 text-[15px]">
            <span>
              <span className="block font-semibold">Multi-line response</span>
              <span className="text-[14px] text-muted-foreground">Shows a larger writing area</span>
            </span>
            <Switch checked={multiline} onCheckedChange={setMultiline} />
          </label>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (state) removeBlank(editor, state.pos);
                onClose();
              }}
            >
              <Trash2 aria-hidden /> Remove blank
            </Button>
            <Button type="submit">Done</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
