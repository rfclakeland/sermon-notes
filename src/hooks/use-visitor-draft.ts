import { useCallback, useEffect, useRef, useState } from "react";
import {
  draftHasContent,
  emptyDraft,
  loadDraft,
  saveDraft,
  storageAvailable,
} from "@/lib/sermon/drafts";
import { saveNoteContext } from "@/lib/sermon/note-context";
import type { Sermon, VisitorDraft } from "@/lib/sermon/types";

export type DraftStatus = "loading" | "idle" | "saving" | "saved" | "unavailable" | "ephemeral";

/** Visitor answers + personal notes for one sermon, auto-saved on this device. */
export function useVisitorDraft(sermonId: string, opts?: { ephemeral?: boolean; sermon?: Sermon }) {
  const ephemeral = !!opts?.ephemeral;
  // Public outline context saved beside the notes so they stay readable if the
  // sermon is later removed or unpublished. Local only — never sent anywhere.
  const sermonRef = useRef<Sermon | undefined>(opts?.sermon);
  sermonRef.current = opts?.sermon;
  const [draft, setDraft] = useState<VisitorDraft>(emptyDraft);
  const [status, setStatus] = useState<DraftStatus>("loading");
  const draftRef = useRef(draft);
  const statusRef = useRef<DraftStatus>("loading");
  const pending = useRef<VisitorDraft | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const setS = (s: DraftStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  useEffect(() => {
    let d = emptyDraft();
    if (ephemeral) setS("ephemeral");
    else if (!storageAvailable()) setS("unavailable");
    else {
      d = loadDraft(sermonId);
      const has = draftHasContent(d);
      if (has && sermonRef.current) saveNoteContext(sermonRef.current);
      setS(has ? "saved" : "idle");
    }
    draftRef.current = d;
    setDraft(d);
  }, [sermonId, ephemeral]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (!pending.current) return;
    const ok = saveDraft(sermonId, pending.current);
    if (ok && sermonRef.current && draftHasContent(pending.current)) {
      saveNoteContext(sermonRef.current);
    }
    pending.current = null;
    setS(ok ? "saved" : "unavailable");
  }, [sermonId]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const update = useCallback(
    (fn: (d: VisitorDraft) => VisitorDraft) => {
      const next = fn(draftRef.current);
      draftRef.current = next;
      setDraft(next);
      const s = statusRef.current;
      if (s === "ephemeral" || s === "unavailable" || s === "loading") return;
      pending.current = next;
      setS("saving");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 450);
    },
    [flush],
  );

  const setBlank = useCallback(
    (id: string, value: string) => update((d) => ({ ...d, blanks: { ...d.blanks, [id]: value } })),
    [update],
  );
  const setPersonal = useCallback(
    (personal: string) => update((d) => ({ ...d, personal })),
    [update],
  );

  return { draft, status, setBlank, setPersonal };
}
