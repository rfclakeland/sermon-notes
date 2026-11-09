import { afterEach, describe, expect, it } from "vitest";
import { demoSermons } from "@/lib/sermon/demo-data";
import { draftKey, listDraftIds } from "@/lib/sermon/drafts";
import { buildOrphanNotesText, orphanAnswers } from "@/lib/sermon/export";
import {
  buildNoteContext,
  contextKey,
  loadNoteContext,
  saveNoteContext,
} from "@/lib/sermon/note-context";

const roof = () => demoSermons().find((s) => s.id === "roof-opened")!;

afterEach(() => window.localStorage.clear());

describe("notes for a sermon that is no longer listed", () => {
  it("keeps context beside the notes without touching the notes key or list", () => {
    const sermon = roof();
    window.localStorage.setItem(
      draftKey(sermon.id),
      JSON.stringify({ blanks: { "legacy-0": "love" }, personal: "Bring a friend." }),
    );
    saveNoteContext(sermon);
    expect(contextKey(sermon.id)).toBe("rfc-notes-context-v1:roof-opened");
    expect(listDraftIds()).toEqual(["roof-opened"]);
    const context = loadNoteContext(sermon.id);
    expect(context?.title).toBe("When the Roof Opened");
    expect(context?.outline).toContain("{{blank:legacy-0}}");
  });

  it("exports the outline with the visitor's answers from local data alone", () => {
    const context = buildNoteContext(roof());
    const draft = { blanks: { "legacy-0": "love" }, personal: "Bring a friend." };
    const text = buildOrphanNotesText(draft, context);
    expect(text).toContain("When the Roof Opened");
    expect(text).toContain("1. begins with love for someone who cannot get there alone.");
    expect(text).toContain("2. works through ________, not a single hero.");
    expect(text).toContain("no longer listed");
    expect(text).toContain("Bring a friend.");
    expect(text).not.toContain("{{blank:");
  });

  it("still lists answers and reflections when no context was saved", () => {
    const draft = { blanks: { a: "grace", b: " ", c: "friends" }, personal: "Pray daily." };
    expect(orphanAnswers(draft, null)).toEqual(["grace", "friends"]);
    const text = buildOrphanNotesText(draft, null);
    expect(text).toContain("MY ANSWERS\n1. grace\n2. friends");
    expect(text).toContain("Pray daily.");
  });
});
