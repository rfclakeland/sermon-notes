import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  convertUnderlinesToBlanks,
  makeBlank,
  removeBlank,
  sermonExtensions,
} from "@/components/admin/editor/extensions";
import { demoSermons } from "@/lib/sermon/demo-data";
import { getSermonDoc, legacyToDelta, listBlanks, sanitizeDoc } from "@/lib/sermon/delta";
import { draftKey } from "@/lib/sermon/drafts";
import { buildNotesText, mailtoHref } from "@/lib/sermon/export";
import { matchesSermon, sermonFromHash } from "@/lib/sermon/search";
import { deltaToTiptap, tiptapToDelta } from "@/lib/sermon/tiptap-adapter";
import type { SermonDoc } from "@/lib/sermon/types";

const roof = () => demoSermons().find((s) => s.id === "roof-opened")!;

describe("legacy conversion", () => {
  it("numbers legacy blanks legacy-0 onward with their answers", () => {
    const blanks = listBlanks(legacyToDelta(roof()));
    expect(blanks.map((b) => b.id)).toEqual(["legacy-0", "legacy-1", "legacy-2", "legacy-3"]);
    expect(blanks.map((b) => b.answer)).toEqual(["concern", "cooperation", "Jesus", "priorities"]);
  });
});

describe("tiptap adapter", () => {
  it("round-trips the document and keeps blank ids", () => {
    const doc = getSermonDoc(roof());
    expect(tiptapToDelta(deltaToTiptap(doc))).toEqual(doc);
  });

  it("round-trips the example rich format", () => {
    const doc: SermonDoc = {
      ops: [
        { insert: "Points", attributes: { bold: true } },
        { insert: "\n", attributes: { header: 2, align: "center" } },
        { insert: "Had " },
        { insert: { blank: { id: "legacy-0", answer: "concern", multiline: false } } },
        { insert: " for others." },
        { insert: "\n", attributes: { list: "ordered" } },
        { insert: "Quote", attributes: { italic: true, color: "#1f4fd1", size: "large" } },
        { insert: "\n", attributes: { blockquote: true } },
        { insert: "Indented" },
        { insert: "\n", attributes: { indent: 2 } },
      ],
    };
    expect(tiptapToDelta(deltaToTiptap(doc))).toEqual(doc);
  });

  it("gives a duplicated blank a new non-positional id", () => {
    const json = deltaToTiptap({
      ops: [
        { insert: { blank: { id: "legacy-0", answer: "a", multiline: false } } },
        { insert: { blank: { id: "legacy-0", answer: "b", multiline: false } } },
        { insert: "\n" },
      ],
    });
    const ids = listBlanks(tiptapToDelta(json, () => "b-new")).map((b) => b.id);
    expect(ids).toEqual(["legacy-0", "b-new"]);
  });
});

describe("sanitizeDoc", () => {
  it("drops unsupported attributes and invalid colors", () => {
    const doc = sanitizeDoc({
      ops: [{ insert: "x", attributes: { link: "javascript:1", color: "red", bold: true } }],
    });
    expect(doc.ops[0]).toEqual({ insert: "x", attributes: { bold: true } });
  });
  it("rejects embeds other than blanks", () => {
    expect(() => sanitizeDoc({ ops: [{ insert: { image: "http://x" } }] })).toThrow();
  });
});

describe("visitor notes", () => {
  it("uses the existing storage key format", () => {
    expect(draftKey("hole-in-the-roof")).toBe("rfc-notes-v1:hole-in-the-roof");
  });

  it("exports typed answers, or model answers only while revealed", () => {
    const s = roof();
    const draft = { blanks: { "legacy-0": "love" }, personal: "Bring a friend." };
    const hidden = buildNotesText(s, draft, false);
    expect(hidden).toContain("1. begins with love for someone who cannot get there alone.");
    expect(hidden).toContain("2. works through ________, not a single hero.");
    expect(hidden).toContain("Bring a friend.");
    const shown = buildNotesText(s, draft, true);
    expect(shown).toContain("1. begins with concern for someone who cannot get there alone.");
    expect(draft.blanks["legacy-0"]).toBe("love");
  });

  it("builds a mailto link with subject and full body", () => {
    const s = roof();
    const href = mailtoHref(s, "Body text");
    expect(href).toBe(
      `mailto:?subject=${encodeURIComponent("Sermon notes: When the Roof Opened")}&body=Body%20text`,
    );
  });
});

describe("links and search", () => {
  it("supports existing /#sermon= links", () => {
    expect(sermonFromHash("#sermon=hole-in-the-roof")).toBe("hole-in-the-roof");
  });
  it("searches speaker, Scripture and month", () => {
    const all = demoSermons();
    expect(all.filter((s) => matchesSermon(s, "pastor")).length).toBe(all.length);
    expect(all.filter((s) => matchesSermon(s, "mark 10")).map((s) => s.id)).toEqual([
      "what-do-you-want",
    ]);
    expect(all.filter((s) => matchesSermon(s, "october")).length).toBe(4);
  });
});

describe("editor blanks", () => {
  const make = (html: string) => new Editor({ extensions: sermonExtensions(), content: html });

  it("converts underlined words to blanks and undo reverts it", () => {
    const ed = make("<p>Had <u>concern</u> for <strong>others</strong>.</p>");
    expect(convertUnderlinesToBlanks(ed)).toBe(1);
    const doc = tiptapToDelta(ed.getJSON());
    expect(listBlanks(doc).map((b) => b.answer)).toEqual(["concern"]);
    expect(doc.ops).toContainEqual({ insert: "others", attributes: { bold: true } });
    ed.commands.undo();
    expect(listBlanks(tiptapToDelta(ed.getJSON()))).toEqual([]);
    expect(ed.getHTML()).toContain("<u>concern</u>");
    ed.destroy();
  });

  it("make blank from selection, then remove restores the text", () => {
    const ed = make("<p>Jesus heals</p>");
    ed.commands.setTextSelection({ from: 1, to: 6 });
    makeBlank(ed);
    const [b] = listBlanks(tiptapToDelta(ed.getJSON()));
    expect(b?.answer).toBe("Jesus");
    expect(b?.id).toMatch(/^b-/);
    removeBlank(ed, 1);
    expect(ed.getText()).toBe("Jesus heals");
    ed.destroy();
  });
});
