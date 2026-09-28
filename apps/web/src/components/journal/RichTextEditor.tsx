import { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Link2,
} from "lucide-react";

/**
 * Editor de texto rico do Diário (Fase 3 do modelo Apple Journal) — troca o
 * <textarea> simples pelos mesmos recursos básicos de formatação do app
 * Diário da Apple: negrito, itálico, sublinhado, tachado, listas, checklist,
 * citação e link. Guarda o conteúdo como HTML na mesma coluna TEXT que já
 * existia (journalService.ts sabe extrair texto puro dele pra contar
 * palavras e montar o preview do feed — nunca mostra HTML cru ao usuário).
 */

function ToolbarButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // não tira o foco do editor ao clicar na toolbar
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
        active ? "bg-cat-pink text-white" : "text-slate hover:bg-black/[0.05] dark:hover:bg-white/[0.08] hover:text-inherit"
      }`}
    >
      {icon}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-0.5 flex-wrap mb-1.5 pb-1.5 border-b border-paper-border dark:border-ink-border">
      <ToolbarButton icon={<Bold size={14} />} label="Negrito" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton icon={<Italic size={14} />} label="Itálico" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton
        icon={<UnderlineIcon size={14} />}
        label="Sublinhado"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolbarButton
        icon={<Strikethrough size={14} />}
        label="Tachado"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <span className="w-px h-4 bg-paper-border dark:bg-ink-border mx-1" />
      <ToolbarButton
        icon={<List size={14} />}
        label="Lista"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={<ListOrdered size={14} />}
        label="Lista numerada"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        icon={<ListChecks size={14} />}
        label="Checklist"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      />
      <span className="w-px h-4 bg-paper-border dark:bg-ink-border mx-1" />
      <ToolbarButton
        icon={<Quote size={14} />}
        label="Citação"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        icon={<Link2 size={14} />}
        label="Link"
        active={editor.isActive("link")}
        onClick={() => {
          const previous = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("Link (URL):", previous ?? "https://");
          if (url === null) return;
          if (url.trim() === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
          }
          editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
        }}
      />
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  minHeightClass = "min-h-[76px]",
}: {
  value: string;
  onChange: (html: string) => void;
  onBlur: () => void;
  placeholder?: string;
  minHeightClass?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, horizontalRule: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TaskList,
      TaskItem.configure({ nested: false }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value || "",
    editorProps: {
      attributes: { class: `journal-rich-content ${minHeightClass}` },
    },
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    onBlur: () => onBlur(),
  });

  // Sincroniza quando o valor externo muda por fora da digitação (troca de
  // dia, por exemplo) — evita sobrescrever o cursor durante a digitação normal.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = value || "<p></p>";
    if (current !== next && !editor.isFocused) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="w-full rounded-xl px-3 py-2.5 bg-paper dark:bg-ink border border-paper-border dark:border-ink-border focus-within:border-cat-pink transition-colors">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
