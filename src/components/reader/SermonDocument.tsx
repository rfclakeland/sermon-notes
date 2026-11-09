import { Fragment, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { groupLines, listBlanks, opsToLines, type Line, type Segment } from "@/lib/sermon/delta";
import type { BlankData, SermonDoc } from "@/lib/sermon/types";

type Props = {
  doc: SermonDoc;
  values: Record<string, string>;
  revealed: boolean;
  onChange: (id: string, value: string) => void;
};

function focusNext(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  if (e.key !== "Enter" || e.shiftKey) return;
  e.preventDefault();
  const all = Array.from(document.querySelectorAll<HTMLElement>("[data-blank-field]"));
  const i = all.indexOf(e.currentTarget);
  (all[i + 1] ?? document.getElementById("personal"))?.focus();
}

function blankWidth(text: string) {
  return `${Math.max((text || "").length + 3, 9)}ch`;
}

function InlineBlank({
  blank,
  n,
  before,
  after,
  value,
  revealed,
  onChange,
}: {
  blank: BlankData;
  n: number;
  before: string;
  after: string;
  value: string;
  revealed: boolean;
  onChange: (v: string) => void;
}) {
  const showAnswer = revealed && !!blank.answer;
  const display = showAnswer ? blank.answer : value;
  const differs =
    showAnswer &&
    value.trim() !== "" &&
    value.trim().toLowerCase() !== blank.answer.trim().toLowerCase();
  const label = `Blank ${n}: ${before} blank ${after}${showAnswer ? " (showing the outline answer)" : ""}`;

  if (blank.multiline) {
    return (
      <textarea
        data-blank-field
        className="personal"
        value={display}
        readOnly={showAnswer}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <>
      <input
        data-blank-field
        data-empty={value.trim() ? "false" : "true"}
        type="text"
        className={showAnswer ? "blank is-revealed" : "blank"}
        style={{ width: blankWidth(display) } as CSSProperties}
        value={display}
        readOnly={showAnswer}
        aria-label={label}
        placeholder=" "
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="next"
        onKeyDown={focusNext}
        onChange={(e) => {
          onChange(e.target.value);
          e.currentTarget.style.width = blankWidth(e.target.value);
          e.currentTarget.dataset["empty"] = e.target.value.trim() ? "false" : "true";
        }}
      />
      {differs ? <span className="you">(you wrote “{value.trim()}”)</span> : null}
    </>
  );
}

function renderText(
  segment: Extract<Segment, { kind: "text" }>,
  key: number,
  plain = false,
): ReactNode {
  let node: ReactNode = segment.text;
  const attrs = plain ? {} : segment.attrs;
  if (attrs.bold) node = <strong>{node}</strong>;
  if (attrs.italic) node = <em>{node}</em>;
  if (attrs.underline) node = <u>{node}</u>;
  if (attrs.strike) node = <s>{node}</s>;
  if (!plain && (attrs.size || attrs.color)) {
    node = (
      <span
        className={attrs.size ? `sz-${attrs.size}` : undefined}
        style={attrs.color ? { color: attrs.color } : undefined}
      >
        {node}
      </span>
    );
  }
  return <Fragment key={key}>{node}</Fragment>;
}

function lineText(line: Line) {
  return line.segments
    .filter((segment): segment is Extract<Segment, { kind: "text" }> => segment.kind === "text")
    .map((segment) => segment.text)
    .join("");
}

export function SermonDocument({ doc, values, revealed, onChange }: Props) {
  const order = new Map(listBlanks(doc).map((blank, index) => [blank.id, index + 1]));
  const blocks = groupLines(opsToLines(doc.ops)).filter(
    (block) => block.type !== "line" || block.line.segments.length > 0,
  );

  const inline = (line: Line, plain = false) => {
    let before = "";
    return line.segments.map((segment, index) => {
      if (segment.kind === "text") {
        before = segment.text;
        return renderText(segment, index, plain);
      }
      const after = line.segments.slice(index + 1).find((item) => item.kind === "text");
      const node = (
        <InlineBlank
          key={segment.id}
          blank={segment}
          n={order.get(segment.id) ?? 0}
          before={before}
          after={after && after.kind === "text" ? after.text : ""}
          value={values[segment.id] ?? ""}
          revealed={revealed}
          onChange={(next) => onChange(segment.id, next)}
        />
      );
      before = "";
      return node;
    });
  };

  const intro: Line[] = [];
  let points: Line[] | null = null;
  const rest = [];
  let consumedList = false;
  for (const block of blocks) {
    if (!consumedList && block.type === "line" && !block.line.attrs.header) {
      intro.push(block.line);
      continue;
    }
    if (!consumedList && block.type === "list" && block.ordered) {
      points = block.items;
      consumedList = true;
      continue;
    }
    consumedList = true;
    rest.push(block);
  }

  const context = intro[0];
  const lead = intro[1];
  const extra = intro.slice(context && (lead || points) ? 2 : 1);
  const leadEnds = lead ? /[.?!…]$/.test(lineText(lead).trim()) : true;

  const generic = (block: (typeof blocks)[number], key: number) => {
    if (block.type === "line") {
      const style: CSSProperties = { textAlign: block.line.attrs.align };
      if (block.line.attrs.header === 1)
        return (
          <h2 key={key} style={style}>
            {inline(block.line)}
          </h2>
        );
      if (block.line.attrs.header === 2)
        return (
          <h3 key={key} style={style}>
            {inline(block.line)}
          </h3>
        );
      if (block.line.attrs.header === 3)
        return (
          <h4 key={key} style={style}>
            {inline(block.line)}
          </h4>
        );
      return (
        <p key={key} style={style}>
          {inline(block.line)}
        </p>
      );
    }
    if (block.type === "quote") {
      return (
        <blockquote key={key}>
          {block.lines.map((line, index) => (
            <p key={index}>{inline(line)}</p>
          ))}
        </blockquote>
      );
    }
    const List = block.ordered ? "ol" : "ul";
    const className = block.ordered ? "points" : undefined;
    return (
      <List key={key} className={className}>
        {block.items.map((line, index) => (
          <li key={index}>{inline(line)}</li>
        ))}
      </List>
    );
  };

  return (
    <div className="prose" id="content">
      {context ? <p className="context">{inline(context)}</p> : null}
      {lead || points ? <p className="section-mark">The message</p> : null}
      {lead ? (
        <p className="lead">
          {inline(lead, true)}
          {leadEnds ? "" : "…"}
        </p>
      ) : null}
      {extra.map((line, index) => (
        <p key={`extra-${index}`}>{inline(line)}</p>
      ))}
      {points ? (
        <ol className="points">
          {points.map((line, index) => (
            <li key={index}>{inline(line)}</li>
          ))}
        </ol>
      ) : null}
      {rest.map((block, index) => generic(block, index))}
    </div>
  );
}
