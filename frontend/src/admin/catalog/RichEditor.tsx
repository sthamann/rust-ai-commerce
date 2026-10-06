/** Actual Tiptap WYSIWYG editor with structured safe content, media, formatting and per-language drafts. */
import { useEffect, useState } from "react";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import { useEditorBuffer } from "./EditorBuffer";
import MarkdownSource from "./MarkdownSource";
import { markdownCompatible } from "./markdown-content";
import { useEditorText } from "./editor-i18n";
import "../styles/markdown-editor.css";
import { Node, mergeAttributes } from "@tiptap/core";
import RichDescription, {
  type RichBlock,
} from "../../shared/content/RichDescription";
import { safeRichUrl } from "../../shared/content/rich-document";
import { useCatalogText } from "./catalog-i18n";
import { editorTransport } from "./editor-document";
import { editorDocument } from "./rich-conversion";
const Video = Node.create({
  name: "video",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: null }, title: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "video[src]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(HTMLAttributes, { controls: true, preload: "metadata" }),
    ];
  },
});
export default function RichEditor({
  value,
  onChange,
  language,
  fallback = "",
}: {
  value: Record<string, RichBlock[]>;
  onChange: (v: Record<string, RichBlock[]>) => void;
  language?: string;
  fallback?: string;
}) {
  const { c, locale } = useCatalogText();
  const e = useEditorText();
  const buffer = useEditorBuffer();
  const [mode, setMode] = useState<"visual" | "markdown">("visual");
  const lang = language ?? locale.slice(0, 2);
  const [media, setMedia] = useState<"image" | "video" | "link" | null>(null);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState(false);
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          link: {
            openOnClick: false,
            protocols: ["https"],
            isAllowedUri: (url) => safeRichUrl(url),
          },
        }),
        Image,
        Video,
        Markdown,
      ],
      content: editorDocument(value[lang] ?? [], fallback),
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-label": c("rich"),
          "aria-multiline": "true",
        },
      },
      onUpdate: ({ editor }) =>
        onChange({
          ...value,
          [lang]: [
            {
              type: "document",
              doc: editorTransport(
                editor.getJSON() as import("../../shared/content/rich-document").RichNode,
              ),
            },
          ],
        }),
    },
    [lang],
  );
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold"),
      italic: editor?.isActive("italic"),
      underline: editor?.isActive("underline"),
      bullets: editor?.isActive("bulletList"),
      numbered: editor?.isActive("orderedList"),
      doc: editor?.getJSON(),
    }),
  });
  useEffect(() => {
    setMedia(null);
    setUrl("");
    setMode("visual");
    setPreview(false);
  }, [lang]);
  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.schema || buffer.pending)
      return;
    const target = editor.schema
      .nodeFromJSON(editorDocument(value[lang] ?? [], fallback))
      .toJSON();
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(target)) {
      editor.commands.setContent(target, { emitUpdate: false });
      setMode("visual");
      setPreview(false);
    }
  }, [editor, lang, value, fallback, buffer.pending]);
  if (!editor) return null;
  const compatible = markdownCompatible(editor.getJSON());
  return (
    <div className="catalog-rich">
      <div className="catalog-editor-mode" role="group" aria-label={c("rich")}>
        <button
          type="button"
          disabled={buffer.pending}
          aria-pressed={mode === "visual"}
          onClick={() => setMode("visual")}
        >
          {e("visual")}
        </button>
        <button
          type="button"
          disabled={!compatible}
          aria-pressed={mode === "markdown"}
          onClick={() => setMode("markdown")}
        >
          {e("markdown")}
        </button>
      </div>
      <p className="muted">{e(compatible ? "hint" : "unsupported")}</p>
      {mode === "visual" && (
        <div
          className="catalog-rich-toolbar"
          role="toolbar"
          aria-label={c("rich")}
        >
          <button
            type="button"
            aria-label={c("bold")}
            aria-pressed={state?.bold}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <b>B</b>
          </button>
          <button
            type="button"
            aria-label={c("italic")}
            aria-pressed={state?.italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <i>I</i>
          </button>
          <button
            type="button"
            aria-label={c("underline")}
            aria-pressed={state?.underline}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <u>U</u>
          </button>
          <select
            aria-label={c("heading")}
            value={
              editor.isActive("heading", { level: 2 })
                ? "2"
                : editor.isActive("heading", { level: 3 })
                  ? "3"
                  : "p"
            }
            onChange={(e) =>
              e.target.value === "p"
                ? editor.chain().focus().setParagraph().run()
                : editor
                    .chain()
                    .focus()
                    .toggleHeading({ level: Number(e.target.value) as 2 | 3 })
                    .run()
            }
          >
            <option value="p">{c("paragraph")}</option>
            <option value="2">{c("heading")} 2</option>
            <option value="3">{c("heading")} 3</option>
          </select>
          <button
            type="button"
            aria-pressed={state?.bullets}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            {c("bullets")}
          </button>
          <button
            type="button"
            aria-pressed={state?.numbered}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            {c("numbered")}
          </button>
          {(["image", "video", "link"] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMedia(media === m ? null : m)}
            >
              {c(m)}
            </button>
          ))}
          <button
            type="button"
            aria-label={c("undo")}
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            ↶
          </button>
          <button
            type="button"
            aria-label={c("redo")}
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            ↷
          </button>
          <button
            type="button"
            aria-pressed={preview}
            onClick={() => setPreview(!preview)}
          >
            {c("preview")}
          </button>
          {mode === "visual" &&
            (["quote", "code", "divider", "strike"] as const).map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => {
                  if (k === "quote")
                    editor.chain().focus().toggleBlockquote().run();
                  if (k === "code")
                    editor.chain().focus().toggleCodeBlock().run();
                  if (k === "divider")
                    editor.chain().focus().setHorizontalRule().run();
                  if (k === "strike")
                    editor.chain().focus().toggleStrike().run();
                }}
              >
                {e(k)}
              </button>
            ))}
        </div>
      )}
      {media && mode === "visual" && (
        <div className="catalog-pair">
          <label>
            {c("url")}
            <input value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <button
            type="button"
            className="studio-secondary"
            disabled={!safeRichUrl(url)}
            onClick={() => {
              if (media === "image")
                editor.chain().focus().setImage({ src: url }).run();
              else if (media === "video")
                editor
                  .chain()
                  .focus()
                  .insertContent({ type: "video", attrs: { src: url } })
                  .run();
              else editor.chain().focus().setLink({ href: url }).run();
              setMedia(null);
              setUrl("");
            }}
          >
            {c("add")}
          </button>
        </div>
      )}
      {preview ? (
        <RichDescription
          blocks={[{ type: "document", doc: state?.doc ?? editor.getJSON() }]}
        />
      ) : mode === "markdown" ? (
        <MarkdownSource key={lang} editor={editor} />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}
