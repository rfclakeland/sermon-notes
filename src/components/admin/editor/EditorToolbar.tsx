import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Heading1,
  Heading2,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  NotebookPen,
  Palette,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  SquareDashedText,
  Strikethrough,
  Underline,
  Undo2,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { changeIndent, makeBlank } from "./extensions";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

function ToolButton({
  icon: Icon,
  label,
  shortcut,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active === undefined ? undefined : active}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35",
            active && "bg-accent text-accent-foreground hover:bg-accent",
          )}
        >
          <Icon className="size-[19px]" strokeWidth={1.8} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="rounded-lg bg-foreground px-2.5 py-1.5 text-[13px] text-background"
      >
        {label}
        {shortcut && <span className="ml-2 opacity-70">{shortcut.replace("Mod", mod)}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

const Sep = () => <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />;

const COLORS = [
  { name: "Default", value: null },
  { name: "Cobalt", value: "#1f4fd1" },
  { name: "Deep red", value: "#a3261f" },
  { name: "Slate", value: "#475467" },
  { name: "Olive", value: "#56632a" },
];

export function EditorToolbar({
  editor,
  onConvertUnderlines,
}: {
  editor: Editor;
  onConvertUnderlines: () => void;
}) {
  const e = editor;
  const c = () => e.chain().focus();
  const level = [1, 2, 3].find((l) => e.isActive("heading", { level: l }));
  const size = e.getAttributes("textStyle")["size"] as string | undefined;

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex items-center gap-0.5 overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible rounded-2xl border border-border bg-paper/90 p-1.5 shadow-lift backdrop-blur-md"
    >
      <ToolButton
        icon={Undo2}
        label="Undo"
        shortcut="Mod+Z"
        disabled={!e.can().undo()}
        onClick={() => c().undo().run()}
      />
      <ToolButton
        icon={Redo2}
        label="Redo"
        shortcut="Mod+Shift+Z"
        disabled={!e.can().redo()}
        onClick={() => c().redo().run()}
      />
      <Sep />
      <ToolButton
        icon={Pilcrow}
        label="Paragraph"
        shortcut="Mod+Alt+0"
        active={e.isActive("paragraph") && !level}
        onClick={() => c().setParagraph().run()}
      />
      <ToolButton
        icon={Heading1}
        label="Heading 1"
        shortcut="Mod+Alt+1"
        active={level === 1}
        onClick={() => c().toggleHeading({ level: 1 }).run()}
      />
      <ToolButton
        icon={Heading2}
        label="Heading 2"
        shortcut="Mod+Alt+2"
        active={level === 2}
        onClick={() => c().toggleHeading({ level: 2 }).run()}
      />
      <ToolButton
        icon={Heading3}
        label="Heading 3"
        shortcut="Mod+Alt+3"
        active={level === 3}
        onClick={() => c().toggleHeading({ level: 3 }).run()}
      />
      <Sep />
      <ToolButton
        icon={Bold}
        label="Bold"
        shortcut="Mod+B"
        active={e.isActive("bold")}
        onClick={() => c().toggleBold().run()}
      />
      <ToolButton
        icon={Italic}
        label="Italic"
        shortcut="Mod+I"
        active={e.isActive("italic")}
        onClick={() => c().toggleItalic().run()}
      />
      <ToolButton
        icon={Underline}
        label="Underline"
        shortcut="Mod+U"
        active={e.isActive("underline")}
        onClick={() => c().toggleUnderline().run()}
      />
      <ToolButton
        icon={Strikethrough}
        label="Strikethrough"
        shortcut="Mod+Shift+S"
        active={e.isActive("strike")}
        onClick={() => c().toggleStrike().run()}
      />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Text size and color"
                onMouseDown={(ev) => ev.preventDefault()}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-0.5 rounded-xl px-2.5 text-foreground/80 hover:bg-muted",
                  (size || e.getAttributes("textStyle")["color"]) &&
                    "bg-accent text-accent-foreground",
                )}
              >
                <Palette className="size-[19px]" strokeWidth={1.8} aria-hidden />
                <ChevronDown className="size-3.5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="rounded-lg bg-foreground px-2.5 py-1.5 text-[13px] text-background"
          >
            Text size and color
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent className="w-56 rounded-xl p-1.5">
          <DropdownMenuLabel className="text-[13px] text-muted-foreground">Size</DropdownMenuLabel>
          {(["small", null, "large", "huge"] as const).map((s) => (
            <DropdownMenuItem
              key={s ?? "normal"}
              className={cn(
                "h-10 rounded-lg text-[15px]",
                (size ?? null) === s && "bg-accent text-accent-foreground",
              )}
              onSelect={() => c().setMark("textStyle", { size: s }).removeEmptyTextStyle().run()}
            >
              {s ? s[0]!.toUpperCase() + s.slice(1) : "Normal"}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[13px] text-muted-foreground">Color</DropdownMenuLabel>
          {COLORS.map((col) => (
            <DropdownMenuItem
              key={col.name}
              className="h-10 gap-3 rounded-lg text-[15px]"
              onSelect={() => (col.value ? c().setColor(col.value).run() : c().unsetColor().run())}
            >
              <span
                className="size-4 rounded-full border border-border"
                style={{ background: col.value ?? "currentColor" }}
                aria-hidden
              />
              {col.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Sep />
      <ToolButton
        icon={List}
        label="Bulleted list"
        shortcut="Mod+Shift+8"
        active={e.isActive("bulletList")}
        onClick={() => c().toggleBulletList().run()}
      />
      <ToolButton
        icon={ListOrdered}
        label="Numbered list"
        shortcut="Mod+Shift+7"
        active={e.isActive("orderedList")}
        onClick={() => c().toggleOrderedList().run()}
      />
      <ToolButton
        icon={Quote}
        label="Quote"
        shortcut="Mod+Shift+B"
        active={e.isActive("blockquote")}
        onClick={() => c().toggleBlockquote().run()}
      />
      <ToolButton
        icon={IndentDecrease}
        label="Decrease indent"
        onClick={() => changeIndent(e, -1)}
      />
      <ToolButton
        icon={IndentIncrease}
        label="Increase indent"
        onClick={() => changeIndent(e, 1)}
      />
      <Sep />
      <ToolButton
        icon={AlignLeft}
        label="Align left"
        shortcut="Mod+Shift+L"
        active={
          e.isActive({ textAlign: "left" }) ||
          (!e.isActive({ textAlign: "center" }) &&
            !e.isActive({ textAlign: "right" }) &&
            !e.isActive({ textAlign: "justify" }))
        }
        onClick={() => c().unsetTextAlign().run()}
      />
      <ToolButton
        icon={AlignCenter}
        label="Align center"
        shortcut="Mod+Shift+E"
        active={e.isActive({ textAlign: "center" })}
        onClick={() => c().setTextAlign("center").run()}
      />
      <ToolButton
        icon={AlignRight}
        label="Align right"
        shortcut="Mod+Shift+R"
        active={e.isActive({ textAlign: "right" })}
        onClick={() => c().setTextAlign("right").run()}
      />
      <ToolButton
        icon={AlignJustify}
        label="Justify"
        shortcut="Mod+Shift+J"
        active={e.isActive({ textAlign: "justify" })}
        onClick={() => c().setTextAlign("justify").run()}
      />
      <Sep />
      <ToolButton
        icon={RemoveFormatting}
        label="Clear formatting"
        onClick={() => c().unsetAllMarks().clearNodes().unsetTextAlign().run()}
      />
      <Sep />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => makeBlank(e)}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-gradient-primary px-4 text-[15px] font-semibold text-primary-foreground shadow-glow hover:brightness-110"
          >
            <SquareDashedText className="size-[19px]" strokeWidth={1.8} aria-hidden />
            {e.state.selection.empty ? "Insert blank" : "Make blank"}
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="rounded-lg bg-foreground px-2.5 py-1.5 text-[13px] text-background"
        >
          Selected text becomes the answer <span className="ml-2 opacity-70">{mod}+Shift+K</span>
        </TooltipContent>
      </Tooltip>
      <ToolButton
        icon={NotebookPen}
        label="Insert note area (multi-line response)"
        onClick={() => makeBlank(e, true)}
      />
      <ToolButton
        icon={WandSparkles}
        label="Convert all underlined text to blanks"
        onClick={onConvertUnderlines}
      />
    </div>
  );
}
