import { describe, expect, it } from "vitest";
import { demoSermons } from "@/lib/sermon/demo-data";
import { SAMPLE_SERMON_IDS } from "@/lib/sermon/sample";
import { REFLECTION_PROMPTS } from "@/components/reader/prompts";
import { shareUrl, shareUrlIncludesNotes } from "@/lib/sermon/export";
import { publicSermons } from "@/lib/sermon/public";
import { looksLikeEmbeddedVerse, validateSermon } from "@/lib/sermon/validate";
import type { Sermon } from "@/lib/sermon/types";

const NAMED_PASTOR = /wilcox|moore|terry|karl|rev\./i;

/** Distinctive modern-translation sentences that must not ship inside the sample outlines. */
const COPYRIGHT_SNIPPETS = [
  "When Jesus saw their faith, he said",
  "Get up, take your mat and walk",
  "Which is easier: to say",
  "If I just touch his clothes",
  "Daughter, your faith has healed you",
  "Jesus, Son of David, have mercy on me",
  "Go, your faith has healed you",
  "Quiet! Be still",
  "Where can we buy bread",
  "We have found the Messiah",
  "you are worried and upset about many things",
  "Mary has chosen what is better",
  "he ran to his son",
  "you of little faith, why did you doubt",
  "like living stones, are being built",
];

function sermonText(sermon: Sermon) {
  return [
    sermon.title,
    sermon.context,
    sermon.lead,
    sermon.scripture,
    sermon.reference,
    sermon.speaker,
    ...sermon.points.flatMap((point) => [point.before, point.answer, point.after]),
  ]
    .join("\n")
    .toLowerCase();
}

describe("sample sermons", () => {
  it("seeds ten published outlines spoken by Pastor", () => {
    const sermons = demoSermons();
    expect(sermons).toHaveLength(10);
    expect(new Set(sermons.map((sermon) => sermon.id))).toEqual(SAMPLE_SERMON_IDS);
    for (const sermon of sermons) {
      expect(sermon.speaker).toBe("Pastor");
      expect(sermon.speaker).not.toMatch(NAMED_PASTOR);
      expect(sermon.status).toBe("published");
      expect(sermon.cover).toMatch(/^\/covers\/\d{2}-.+\.jpg$/);
      expect(sermonText(sermon)).not.toMatch(NAMED_PASTOR);
    }
  });

  it("keeps scripture as a reference and leaves verse text off the page", () => {
    for (const sermon of demoSermons()) {
      expect(looksLikeEmbeddedVerse(sermon.scripture)).toBe(false);
      expect(looksLikeEmbeddedVerse(sermon.reference)).toBe(false);
      expect(sermon.scripture).toMatch(/\d+:\d+/);
      const body = sermonText(sermon);
      for (const snippet of COPYRIGHT_SNIPPETS) {
        expect(body).not.toContain(snippet.toLowerCase());
      }
    }
  });

  it("hides drafts from the public list", () => {
    const [first, ...rest] = demoSermons();
    const draft: Sermon = {
      ...first!,
      id: "staff-draft",
      title: "Unpublished outline",
      status: "draft",
    };
    const visible = publicSermons([draft, ...rest]);
    expect(visible.map((sermon) => sermon.id)).not.toContain("staff-draft");
    expect(visible.every((sermon) => sermon.status === "published")).toBe(true);
  });

  it("requires an explicit status on new records", () => {
    const sermon = demoSermons()[0]!;
    expect(() => validateSermon({ ...sermon, status: undefined })).toThrow(/status/);
    expect(validateSermon({ ...sermon, status: "draft" }).status).toBe("draft");
  });
});

describe("share links", () => {
  it("never carries personal notes or typed blanks", () => {
    const sermon = demoSermons()[0]!;
    const draft = {
      blanks: { "legacy-0": "a private concern I would not share" },
      personal:
        "I want to be the kind of friend who will do the inconvenient thing so someone else can get to Jesus.",
    };
    const url = shareUrl("https://restoration-notes.example.workers.dev", sermon.id);
    expect(url).toBe("https://restoration-notes.example.workers.dev/sermons/roof-opened");
    expect(new URL(url).search).toBe("");
    expect(new URL(url).hash).toBe("");
    expect(shareUrlIncludesNotes(url, draft)).toBe(false);
    expect(url).not.toContain(draft.personal);
    expect(url).not.toContain(draft.blanks["legacy-0"]);
    expect(
      shareUrlIncludesNotes(`${url}?personal=${encodeURIComponent(draft.personal)}`, draft),
    ).toBe(true);
    expect(shareUrl("https://restoration-notes.example.workers.dev", sermon.id)).toBe(url);
  });
});

describe("reflection prompts", () => {
  it("uses plain labels", () => {
    const labels = REFLECTION_PROMPTS.map((prompt) => prompt.label).join(" ");
    expect(labels).not.toMatch(/sparkle|✨|★/);
    expect(labels).toContain("Key takeaway");
    expect(labels).toContain("Prayer for this week");
    expect(labels).toContain("Step of action");
  });
});
