// Existing production data contract (Cloudflare Worker + D1). Keep in sync with the API.

export type BlankData = { id: string; answer: string; multiline: boolean };
export type BlankEmbed = { blank: BlankData };

export type InlineAttrs = {
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  size?: "small" | "large" | "huge";
  color?: string;
};

export type LineAttrs = {
  header?: 1 | 2 | 3;
  list?: "ordered" | "bullet";
  blockquote?: true;
  align?: "center" | "right" | "justify";
  indent?: number;
};

export type DeltaOp = { insert: string | BlankEmbed; attributes?: InlineAttrs & LineAttrs };
export type SermonDoc = { ops: DeltaOp[] };

export type LegacyPoint = { before: string; answer: string; after: string };

export type SermonStatus = "draft" | "published";

export type Sermon = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  speaker: string;
  scripture: string;
  reference: string;
  /** New records set this explicitly. Drafts stay off public lists. */
  status: SermonStatus;
  cover?: string;
  context: string;
  lead: string;
  points: LegacyPoint[];
  content?: SermonDoc;
};

export type SermonCollection = { sermons: Sermon[]; revision: number };

/** Visitor draft stored at localStorage `rfc-notes-v1:<sermon-id>`. */
export type VisitorDraft = { blanks: Record<string, string>; personal: string };
