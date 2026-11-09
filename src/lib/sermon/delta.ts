import type { BlankData, DeltaOp, InlineAttrs, LineAttrs, Sermon, SermonDoc } from "./types";

export const BLANK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const HEX = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
const SIZES = ["small", "large", "huge"] as const;
const ALIGNS = ["center", "right", "justify"] as const;

/** New, non-positional blank id. Call only from event handlers (not module scope). */
export function newBlankId(): string {
  return `b-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export type TextSegment = { kind: "text"; text: string; attrs: InlineAttrs };
export type BlankSegment = { kind: "blank" } & BlankData;
export type Segment = TextSegment | BlankSegment;
export type Line = { segments: Segment[]; attrs: LineAttrs };
export type Block =
  | { type: "line"; line: Line }
  | { type: "list"; ordered: boolean; items: Line[] }
  | { type: "quote"; lines: Line[] };

const hasKeys = (o: object) => Object.keys(o).length > 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanInline(a: any): InlineAttrs {
  const o: InlineAttrs = {};
  if (!a || typeof a !== "object") return o;
  if (a.bold) o.bold = true;
  if (a.italic) o.italic = true;
  if (a.underline) o.underline = true;
  if (a.strike) o.strike = true;
  if ((SIZES as readonly string[]).includes(a.size)) o.size = a.size;
  if (typeof a.color === "string" && HEX.test(a.color)) o.color = a.color.toLowerCase();
  return o;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanLine(a: any): LineAttrs {
  const o: LineAttrs = {};
  if (!a || typeof a !== "object") return o;
  const h = Number(a.header);
  if (h === 1 || h === 2 || h === 3) o.header = h;
  if (a.list === "ordered" || a.list === "bullet") o.list = a.list;
  if (a.blockquote) o.blockquote = true;
  if ((ALIGNS as readonly string[]).includes(a.align)) o.align = a.align;
  const ind = Math.round(Number(a.indent));
  if (ind >= 1 && ind <= 8) o.indent = ind;
  return o;
}

/** Validate + whitelist an untrusted document. Throws a readable message. */
export function sanitizeDoc(raw: unknown): SermonDoc {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any;
  if (!r || typeof r !== "object" || !Array.isArray(r.ops)) {
    throw new Error("Document must look like {ops:[...]}");
  }
  const ops: DeltaOp[] = [];
  const seen = new Set<string>();
  for (const op of r.ops) {
    if (!op || typeof op !== "object") throw new Error("Document contains an invalid item.");
    if (typeof op.insert === "string") {
      const attrs = op.insert.includes("\n")
        ? { ...cleanInline(op.attributes), ...cleanLine(op.attributes) }
        : cleanInline(op.attributes);
      ops.push(hasKeys(attrs) ? { insert: op.insert, attributes: attrs } : { insert: op.insert });
    } else if (op.insert && typeof op.insert === "object" && op.insert.blank) {
      const b = op.insert.blank;
      if (typeof b.id !== "string" || !BLANK_ID_RE.test(b.id)) {
        throw new Error("A blank has a missing or invalid id.");
      }
      if (seen.has(b.id)) throw new Error(`Blank id "${b.id}" is used twice.`);
      seen.add(b.id);
      ops.push({
        insert: {
          blank: {
            id: b.id,
            answer: typeof b.answer === "string" ? b.answer.slice(0, 500) : "",
            multiline: !!b.multiline,
          },
        },
      });
    } else {
      throw new Error("Only text and blanks are allowed in a sermon document.");
    }
  }
  const last = ops.at(-1);
  if (!last || typeof last.insert !== "string" || !last.insert.endsWith("\n")) {
    ops.push({ insert: "\n" });
  }
  return { ops };
}

export function opsToLines(ops: DeltaOp[]): Line[] {
  const lines: Line[] = [];
  let cur: Segment[] = [];
  for (const op of ops) {
    if (typeof op.insert === "string") {
      const parts = op.insert.split("\n");
      parts.forEach((p, i) => {
        if (p) cur.push({ kind: "text", text: p, attrs: cleanInline(op.attributes) });
        if (i < parts.length - 1) {
          lines.push({ segments: cur, attrs: cleanLine(op.attributes) });
          cur = [];
        }
      });
    } else if (op.insert && "blank" in op.insert) {
      cur.push({ kind: "blank", ...op.insert.blank });
    }
  }
  if (cur.length) lines.push({ segments: cur, attrs: {} });
  return lines;
}

function sameAttrs(a?: object, b?: object) {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

export function linesToOps(lines: Line[]): DeltaOp[] {
  const ops: DeltaOp[] = [];
  const push = (op: DeltaOp) => {
    const prev = ops.at(-1);
    if (
      prev &&
      typeof prev.insert === "string" &&
      typeof op.insert === "string" &&
      !prev.insert.endsWith("\n") &&
      !op.insert.includes("\n") &&
      sameAttrs(prev.attributes, op.attributes)
    ) {
      prev.insert += op.insert;
      return;
    }
    ops.push(op);
  };
  for (const l of lines) {
    for (const s of l.segments) {
      if (s.kind === "text") {
        if (!s.text) continue;
        push(
          hasKeys(s.attrs) ? { insert: s.text, attributes: { ...s.attrs } } : { insert: s.text },
        );
      } else {
        ops.push({ insert: { blank: { id: s.id, answer: s.answer, multiline: s.multiline } } });
      }
    }
    ops.push(hasKeys(l.attrs) ? { insert: "\n", attributes: { ...l.attrs } } : { insert: "\n" });
  }
  return ops;
}

export function groupLines(lines: Line[]): Block[] {
  const blocks: Block[] = [];
  for (const line of lines) {
    const last = blocks.at(-1);
    if (line.attrs.blockquote) {
      if (last?.type === "quote") last.lines.push(line);
      else blocks.push({ type: "quote", lines: [line] });
    } else if (line.attrs.list) {
      const ordered = line.attrs.list === "ordered";
      if (last?.type === "list" && last.ordered === ordered) last.items.push(line);
      else blocks.push({ type: "list", ordered, items: [line] });
    } else {
      blocks.push({ type: "line", line });
    }
  }
  return blocks;
}

/** Legacy {context, lead, points[]} → document. Blank ids are legacy-0, legacy-1, … */
export function legacyToDelta(s: Pick<Sermon, "context" | "lead" | "points">): SermonDoc {
  const ops: DeltaOp[] = [];
  if (s.context?.trim()) ops.push({ insert: s.context.trim() }, { insert: "\n" });
  if (s.lead?.trim())
    ops.push({ insert: s.lead.trim(), attributes: { bold: true } }, { insert: "\n" });
  (s.points ?? []).forEach((p, i) => {
    if (p.before) ops.push({ insert: p.before });
    ops.push({
      insert: { blank: { id: `legacy-${i}`, answer: p.answer ?? "", multiline: false } },
    });
    if (p.after) ops.push({ insert: p.after });
    ops.push({ insert: "\n", attributes: { list: "ordered" } });
  });
  if (!ops.length) ops.push({ insert: "\n" });
  return { ops };
}

export function getSermonDoc(s: Sermon): SermonDoc {
  return s.content ?? legacyToDelta(s);
}

export function listBlanks(doc: SermonDoc): BlankData[] {
  return doc.ops.flatMap((o) => (typeof o.insert === "object" ? [o.insert.blank] : []));
}

/** Plain text rendering for download / email. */
export function docToPlainText(doc: SermonDoc, valueFor: (b: BlankData) => string): string {
  const out: string[] = [];
  let n = 0;
  let prevList: string | null = null;
  for (const line of opsToLines(doc.ops)) {
    const list = line.attrs.list ?? null;
    if (list === "ordered") n = prevList === "ordered" ? n + 1 : 1;
    prevList = list;
    const text = line.segments
      .map((s) => {
        if (s.kind === "text") return s.text;
        const v = valueFor(s).trim();
        if (s.multiline) {
          const body = v
            ? v
                .split("\n")
                .map((l) => `    ${l}`)
                .join("\n")
            : "    (no response)";
          return `\n${body}\n`;
        }
        return v || "________";
      })
      .join("");
    const indent = "  ".repeat(line.attrs.indent ?? 0);
    const prefix =
      list === "ordered" ? `${n}. ` : list === "bullet" ? "• " : line.attrs.blockquote ? "> " : "";
    if (line.attrs.header) out.push("");
    out.push(indent + prefix + text);
    if (line.attrs.header) out.push("");
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
