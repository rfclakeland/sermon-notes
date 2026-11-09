import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlankStorage } from "./extensions";

export function BlankView({ node, editor, getPos, selected }: NodeViewProps) {
  const answer = String(node.attrs["answer"] ?? "");
  const multiline = !!node.attrs["multiline"];
  const open = () => {
    const pos = getPos();
    if (typeof pos === "number")
      (editor.storage as unknown as { blank: BlankStorage }).blank.onEdit?.(pos);
  };
  return (
    <NodeViewWrapper
      as="span"
      className={cn("blank-token", multiline && "is-note", selected && "is-selected")}
    >
      <button
        type="button"
        contentEditable={false}
        className="blank-token-btn"
        onClick={open}
        aria-label={`${multiline ? "Note area" : "Blank"}${answer ? `, answer: ${answer}` : ", free response"}. Edit`}
      >
        {multiline ? (
          <>
            <NotebookPen className="size-4" aria-hidden />
            {answer ? `Note area · ${answer}` : "Note area"}
          </>
        ) : answer ? (
          answer
        ) : (
          <em className="font-normal opacity-80">free response</em>
        )}
      </button>
    </NodeViewWrapper>
  );
}
