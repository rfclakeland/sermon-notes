import { Extension, Node, mergeAttributes, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, NodeSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { newBlankId } from "@/lib/sermon/delta";
import { BlankView } from "./BlankView";

export type BlankStorage = { onEdit: ((pos: number) => void) | null };

/** Atomic inline blank token. `id` is stable and preserved on edit. */
export const BlankNode = Node.create({
  name: "blank",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addStorage(): BlankStorage {
    return { onEdit: null };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-blank-id"),
        renderHTML: (a) => ({ "data-blank-id": a["id"] }),
      },
      answer: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-answer") ?? el.textContent ?? "",
        renderHTML: (a) => ({ "data-answer": a["answer"] }),
      },
      multiline: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-multiline") === "true",
        renderHTML: (a) => ({ "data-multiline": String(!!a["multiline"]) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-blank-id]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "blank-token" }),
      node.attrs["answer"] || "____",
    ];
  },

  renderText({ node }) {
    return node.attrs["answer"] || "____";
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlankView, { as: "span" });
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const sel = editor.state.selection;
        if (sel instanceof NodeSelection && sel.node.type.name === "blank") {
          (editor.storage as unknown as { blank: BlankStorage }).blank.onEdit?.(sel.from);
          return true;
        }
        return false;
      },
      "Mod-Shift-k": ({ editor }) => {
        makeBlank(editor);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    // Copy/paste can duplicate a token; give later duplicates fresh ids so answers never collide.
    return [
      new Plugin({
        key: new PluginKey("blank-unique-ids"),
        appendTransaction: (trs, _old, state) => {
          if (!trs.some((t) => t.docChanged)) return null;
          const seen = new Set<string>();
          let tr = null as ReturnType<typeof state.tr.setMeta> | null;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== "blank") return;
            const id = node.attrs["id"] as string | null;
            if (!id || seen.has(id)) {
              const nid = newBlankId();
              tr = (tr ?? state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, id: nid });
              seen.add(nid);
            } else seen.add(id);
          });
          return tr;
        },
      }),
    ];
  },
});

export const Indent = Extension.create({
  name: "indent",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => Number(el.getAttribute("data-indent")) || 0,
            renderHTML: (a) =>
              a["indent"]
                ? { "data-indent": a["indent"], style: `margin-left:${a["indent"] * 1.5}em` }
                : {},
          },
        },
      },
    ];
  },
});

export const SizeAttr = Extension.create({
  name: "sermonSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          size: {
            default: null,
            parseHTML: (el) => {
              const v = el.getAttribute("data-size");
              return v === "small" || v === "large" || v === "huge" ? v : null;
            },
            renderHTML: (a) => (a["size"] ? { "data-size": a["size"] } : {}),
          },
        },
      },
    ];
  },
});

export const sermonExtensions = () => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
    code: false,
    horizontalRule: false,
    link: false,
  }),
  TextAlign.configure({
    types: ["heading", "paragraph"],
    alignments: ["left", "center", "right", "justify"],
  }),
  TextStyle,
  Color,
  SizeAttr,
  Indent,
  BlankNode,
];

/* ---------------- Commands ---------------- */

/** Turn the selection into a blank (answer = selected text), or insert an empty blank at the cursor. */
export function makeBlank(editor: Editor, multiline = false) {
  const { from, to, empty } = editor.state.selection;
  const answer = empty ? "" : editor.state.doc.textBetween(from, to, " ").trim();
  editor
    .chain()
    .focus()
    .insertContentAt(
      { from, to },
      { type: "blank", attrs: { id: newBlankId(), answer, multiline } },
    )
    .run();
}

/** Convert every underlined run into a blank token in one undoable step. Returns the count. */
export function convertUnderlinesToBlanks(editor: Editor): number {
  const { state } = editor;
  const underline = state.schema.marks["underline"]!;
  const blankType = state.schema.nodes["blank"]!;
  const ranges: { from: number; to: number; text: string }[] = [];
  state.doc.descendants((node, pos) => {
    if (node.isText && underline.isInSet(node.marks)) {
      const last = ranges.at(-1);
      if (last && last.to === pos) {
        last.to = pos + node.nodeSize;
        last.text += node.text ?? "";
      } else ranges.push({ from: pos, to: pos + node.nodeSize, text: node.text ?? "" });
    }
  });
  const tr = state.tr;
  let count = 0;
  for (const r of ranges.reverse()) {
    const lead = r.text.length - r.text.trimStart().length;
    const trail = r.text.length - r.text.trimEnd().length;
    const answer = r.text.trim();
    if (!answer) continue;
    tr.replaceWith(
      r.from + lead,
      r.to - trail,
      blankType.create({ id: newBlankId(), answer, multiline: false }),
    );
    count++;
  }
  if (count) editor.view.dispatch(tr);
  return count;
}

export function updateBlank(
  editor: Editor,
  pos: number,
  attrs: { answer: string; multiline: boolean },
) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "blank") return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
  editor.commands.focus();
}

/** Remove the token and put its answer back as ordinary text. */
export function removeBlank(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "blank") return;
  const answer = String(node.attrs["answer"] ?? "");
  const tr = answer
    ? editor.state.tr.replaceWith(pos, pos + node.nodeSize, editor.state.schema.text(answer))
    : editor.state.tr.delete(pos, pos + node.nodeSize);
  editor.view.dispatch(tr);
  editor.commands.focus();
}

export function changeIndent(editor: Editor, delta: 1 | -1) {
  if (editor.isActive("listItem")) {
    if (delta > 0) editor.chain().focus().sinkListItem("listItem").run();
    else editor.chain().focus().liftListItem("listItem").run();
    return;
  }
  const type = editor.isActive("heading") ? "heading" : "paragraph";
  const cur = Number(editor.getAttributes(type)["indent"] || 0);
  editor
    .chain()
    .focus()
    .updateAttributes(type, { indent: Math.max(0, Math.min(8, cur + delta)) })
    .run();
}
