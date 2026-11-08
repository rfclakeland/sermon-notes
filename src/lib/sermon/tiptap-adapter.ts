import type { JSONContent } from "@tiptap/core";
import {
  BLANK_ID_RE,
  cleanInline,
  groupLines,
  linesToOps,
  newBlankId,
  opsToLines,
  type Line,
  type Segment,
} from "./delta";
import type { InlineAttrs, LineAttrs, SermonDoc } from "./types";

/**
 * Tiptap JSON is internal editor state only. These adapters convert to/from the
 * production delta-style document so blank ids survive round-trips.
 */

function segToNode(s: Segment): JSONContent {
  if (s.kind === "blank") {
    return { type: "blank", attrs: { id: s.id, answer: s.answer, multiline: s.multiline } };
  }
  const marks: JSONContent["marks"] = [];
  if (s.attrs["bold"]) marks.push({ type: "bold" });
  if (s.attrs["italic"]) marks.push({ type: "italic" });
  if (s.attrs["underline"]) marks.push({ type: "underline" });
  if (s.attrs["strike"]) marks.push({ type: "strike" });
  if (s.attrs["color"] || s.attrs["size"]) {
    marks.push({
      type: "textStyle",
      attrs: { color: s.attrs["color"] ?? null, size: s.attrs["size"] ?? null },
    });
  }
  return marks.length ? { type: "text", text: s.text, marks } : { type: "text", text: s.text };
}

function lineToNode(l: Line): JSONContent {
  const attrs = { textAlign: l.attrs["align"] ?? null, indent: l.attrs["indent"] ?? 0 };
  const content = l.segments.filter((s) => s.kind === "blank" || s.text).map(segToNode);
  const node: JSONContent = l.attrs["header"]
    ? { type: "heading", attrs: { ...attrs, level: l.attrs["header"] } }
    : { type: "paragraph", attrs };
  if (content.length) node.content = content;
  return node;
}

export function deltaToTiptap(doc: SermonDoc): JSONContent {
  const content = groupLines(opsToLines(doc.ops)).map((b): JSONContent => {
    if (b.type === "line") return lineToNode(b.line);
    if (b.type === "list") {
      return {
        type: b.ordered ? "orderedList" : "bulletList",
        content: b.items.map((l) => ({ type: "listItem", content: [lineToNode(l)] })),
      };
    }
    return { type: "blockquote", content: b.lines.map(lineToNode) };
  });
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

export function tiptapToDelta(json: JSONContent, genId: () => string = newBlankId): SermonDoc {
  const lines: Line[] = [];
  const seen = new Set<string>();

  const inline = (nodes: JSONContent[] = [], lineAttrs: LineAttrs) => {
    let segs: Segment[] = [];
    for (const n of nodes) {
      if (n.type === "text") {
        const a: Record<string, unknown> = {};
        for (const m of n.marks ?? []) {
          if (
            m.type === "bold" ||
            m.type === "italic" ||
            m.type === "underline" ||
            m.type === "strike"
          ) {
            a[m.type] = true;
          } else if (m.type === "textStyle") {
            if (m.attrs?.["color"]) a["color"] = m.attrs["color"];
            if (m.attrs?.["size"]) a["size"] = m.attrs["size"];
          }
        }
        segs.push({ kind: "text", text: n.text ?? "", attrs: cleanInline(a) as InlineAttrs });
      } else if (n.type === "blank") {
        let id = String(n.attrs?.["id"] ?? "");
        if (!BLANK_ID_RE.test(id) || seen.has(id)) id = genId();
        seen.add(id);
        segs.push({
          kind: "blank",
          id,
          answer: String(n.attrs?.["answer"] ?? ""),
          multiline: !!n.attrs?.["multiline"],
        });
      } else if (n.type === "hardBreak") {
        lines.push({ segments: segs, attrs: lineAttrs });
        segs = [];
      }
    }
    lines.push({ segments: segs, attrs: lineAttrs });
  };

  const blockAttrs = (n: JSONContent, extra: LineAttrs): LineAttrs => {
    const a: LineAttrs = { ...extra };
    delete a["indent"];
    if (n.type === "heading") {
      const lv = n.attrs?.["level"];
      if (lv === 1 || lv === 2 || lv === 3) a.header = lv;
    }
    const al = n.attrs?.["textAlign"];
    if (al === "center" || al === "right" || al === "justify") a.align = al;
    const ind = Math.min(8, Number(n.attrs?.["indent"] || 0) + (extra.indent ?? 0));
    if (ind > 0) a["indent"] = ind;
    return a;
  };

  const walk = (n: JSONContent, extra: LineAttrs) => {
    switch (n.type) {
      case "paragraph":
      case "heading":
        inline(n.content, blockAttrs(n, extra));
        break;
      case "bulletList":
      case "orderedList":
        for (const item of n.content ?? []) {
          for (const child of item.content ?? []) {
            if (child.type === "bulletList" || child.type === "orderedList") {
              walk(child, { ...extra, indent: (extra.indent ?? 0) + 1 });
            } else {
              walk(child, { ...extra, list: n.type === "orderedList" ? "ordered" : "bullet" });
            }
          }
        }
        break;
      case "blockquote":
        for (const c of n.content ?? []) walk(c, { ...extra, blockquote: true });
        break;
      default:
        for (const c of n.content ?? []) walk(c, extra);
    }
  };

  for (const c of json.content ?? []) walk(c, {});
  return { ops: linesToOps(lines) };
}
