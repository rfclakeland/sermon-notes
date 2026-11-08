import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useVisitorDraft, type DraftStatus } from "@/hooks/use-visitor-draft";
import { isSampleSermon } from "@/lib/sermon/sample";
import { getSermonDoc, listBlanks } from "@/lib/sermon/delta";
import {
  bibleGatewayUrl,
  buildNotesText,
  downloadText,
  formatDate,
  mailtoHref,
  shareUrl,
  shareUrlIncludesNotes,
} from "@/lib/sermon/export";
import type { Sermon } from "@/lib/sermon/types";
import { SermonDocument } from "./SermonDocument";
import { REFLECTION_PROMPTS } from "./prompts";

function SaveLine({ status }: { status: DraftStatus }) {
  if (status === "unavailable")
    return (
      <span className="saved-line">
        This browser isn’t saving notes. Download a copy before you leave.
      </span>
    );
  if (status === "ephemeral")
    return <span className="saved-line">Preview — typing here isn’t kept.</span>;
  return <span className="saved-line">Answers save in this browser — no account or sync.</span>;
}

export function SermonReader({
  sermon,
  preview = false,
  isLatest = false,
}: {
  sermon: Sermon;
  preview?: boolean;
  isLatest?: boolean;
}) {
  const { draft, status, setBlank, setPersonal } = useVisitorDraft(sermon.id, {
    ephemeral: preview,
  });
  const [revealed, setRevealed] = useState(false);
  const [open, setOpen] = useState<"share" | "keep" | null>(null);
  const actsRef = useRef<HTMLDivElement>(null);
  const doc = getSermonDoc(sermon);
  const blanks = listBlanks(doc);
  const filled = blanks.filter((blank) => (draft.blanks[blank.id] ?? "").trim()).length;
  const passage = sermon.reference || sermon.scripture;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!actsRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const notesText = () => buildNotesText(sermon, draft, revealed);
  const close = () => setOpen(null);

  const copyLink = async () => {
    close();
    const url = shareUrl(window.location.origin, sermon.id);
    if (shareUrlIncludesNotes(url, draft)) {
      toast("Couldn’t copy a link that contains your notes.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Sermon link copied");
    } catch {
      toast("Copy this sermon link", { description: url });
    }
  };
  const copyNotes = async () => {
    close();
    try {
      await navigator.clipboard.writeText(notesText());
      toast("Your notes copied");
    } catch {
      toast("Couldn’t copy from this browser. Use Download instead.");
    }
  };
  const download = () => {
    close();
    downloadText(`${sermon.id}-notes.txt`, notesText());
    toast("Your notes downloaded");
  };
  const email = () => {
    close();
    window.location.href = mailtoHref(sermon, notesText());
    toast("Opening an email with your notes");
  };

  const jump = () => {
    const root = document.getElementById("content");
    const empty = root?.querySelector<HTMLElement>('.blank[data-empty="true"]:not([readonly])');
    const target = empty ?? document.getElementById("personal");
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    target.focus({ preventScroll: true });
  };

  const addPrompt = (text: string) => {
    const next = draft.personal.trim() ? `${draft.personal.trim()}\n\n${text}` : text;
    setPersonal(next);
    document.getElementById("personal")?.focus();
  };

  return (
    <article aria-labelledby="sermon-title">
      <section className="hero">
        {sermon.cover ? (
          <img src={sermon.cover} alt="" width={1600} height={1000} fetchPriority="high" />
        ) : null}
        <div className="wrap">
          <p className="eyebrow">
            {isLatest ? "Latest sermon" : "Sermon"} · {formatDate(sermon.date, "short")}
          </p>
          <h1 id="sermon-title">{sermon.title}</h1>
          <div className="byline">
            {sermon.speaker ? <span>{sermon.speaker}</span> : null}
            {sermon.speaker && passage ? <span className="sep" aria-hidden="true" /> : null}
            {passage ? (
              <a href={bibleGatewayUrl(passage)} target="_blank" rel="noreferrer">
                {sermon.scripture || passage}
                <span className="sr-only"> (opens Bible Gateway)</span>
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <div className="persist">
        <div className="wrap">
          <SaveLine status={status} />
          <div className="acts" ref={actsRef}>
            {blanks.length > 0 ? (
              <button
                type="button"
                className="tbtn count"
                onClick={jump}
                title="Go to the next empty blank"
              >
                <b>
                  {filled}/{blanks.length}
                </b>{" "}
                <span>filled</span>
              </button>
            ) : null}
            {blanks.some((blank) => blank.answer) ? (
              <button
                type="button"
                className="tbtn quiet"
                aria-pressed={revealed}
                onClick={() => setRevealed((value) => !value)}
              >
                {revealed ? "Hide" : "Reveal"}
                <span className="lg"> answers</span>
              </button>
            ) : null}
            <span className="vr" aria-hidden="true" />
            <button
              type="button"
              className="tbtn"
              aria-expanded={open === "share"}
              aria-controls="sharepanel"
              onClick={() => setOpen((value) => (value === "share" ? null : "share"))}
            >
              Share<span className="lg"> sermon</span>
            </button>
            <button
              type="button"
              className="tbtn primary"
              aria-expanded={open === "keep"}
              aria-controls="keeppanel"
              onClick={() => setOpen((value) => (value === "keep" ? null : "keep"))}
            >
              Keep my notes
            </button>
            <div className={open === "share" ? "panel open" : "panel"} id="sharepanel">
              <p>Shares the sermon only — never your notes.</p>
              <button type="button" onClick={copyLink}>
                Copy sermon link
              </button>
            </div>
            <div className={open === "keep" ? "panel open" : "panel"} id="keeppanel">
              <p>Your answers and reflections, for you.</p>
              <button type="button" onClick={copyNotes}>
                Copy my notes
              </button>
              <button type="button" onClick={download}>
                Download my notes
              </button>
              <button type="button" onClick={email}>
                Email my notes to myself
              </button>
              <button
                type="button"
                onClick={() => {
                  close();
                  window.print();
                }}
              >
                Print filled notes
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="well">
        <div className="wrap">
          <div className="grid">
            <aside className="side">
              <div className="block">
                <span className="label">Scripture</span>
                <p className="ref">{sermon.scripture}</p>
                {passage ? (
                  <a
                    className="read"
                    href={bibleGatewayUrl(passage)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read the passage ↗
                  </a>
                ) : null}
              </div>
              <div className="block">
                <span className="label">Preached</span>
                {formatDate(sermon.date)}
                <br />
                {sermon.speaker}
                {isSampleSermon(sermon.id) ? (
                  <>
                    <br />
                    Sample outline
                  </>
                ) : null}
              </div>
            </aside>
            <div>
              <SermonDocument
                doc={doc}
                values={draft.blanks}
                revealed={revealed}
                onChange={setBlank}
              />
              <section className="reflections" aria-labelledby="refl-h">
                <h2 id="refl-h">Your reflections</h2>
                <p className="help">
                  Questions, prayers, or a step of faith to remember this week.
                </p>
                <div className="chips">
                  {REFLECTION_PROMPTS.map((prompt) => (
                    <button
                      key={prompt.label}
                      type="button"
                      className="chip"
                      onClick={() => addPrompt(prompt.text)}
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
                <textarea
                  className="personal"
                  id="personal"
                  aria-label="Your reflections"
                  placeholder="Write what you want to remember…"
                  value={draft.personal}
                  onChange={(event) => setPersonal(event.target.value)}
                />
                <p className="foot">
                  Find these later in <Link to="/notes">My notes</Link>.
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
