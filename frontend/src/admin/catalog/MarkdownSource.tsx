/** Live Markdown buffer updates the same structured product document; no raw HTML is rendered or persisted. */
import { useState, useEffect } from "react";
import type { RichNode } from "../../shared/content/rich-document";
import type { Editor } from "@tiptap/core";
import { useEditorBuffer } from "./EditorBuffer";
import { useEditorText } from "./editor-i18n";
import { editorTransport } from "./editor-document";
import { safeMarkdownDocument } from "./markdown-content";
export default function MarkdownSource({ editor }: { editor: Editor }) {
  const e = useEditorText();
  const buffer = useEditorBuffer();
  useEffect(() => () => buffer.setPending(false), [buffer.setPending]);
  const [source, setSource] = useState(() => editor.getMarkdown());
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <div className="catalog-markdown-source">
      <label>
        {e("source")}
        <textarea
          rows={14}
          maxLength={64000}
          spellCheck={false}
          value={source}
          onChange={(event) => {
            const text = event.target.value;
            setSource(text);
            setPending(true);
            buffer.setPending(true);
            setError(false);
          }}
        />
      </label>
      {pending && <p role="status">{e("pending")}</p>}
      <button
        type="button"
        className="studio-primary"
        disabled={!pending}
        onClick={() => {
          try {
            const doc = editorTransport(
              editor.markdown!.parse(source) as RichNode,
            );
            if (!safeMarkdownDocument(doc)) throw Error();
            editor.commands.setContent(doc);
            setPending(false);
            buffer.setPending(false);
            setError(false);
          } catch {
            setError(true);
          }
        }}
      >
        {e("apply")}
      </button>
      <button
        type="button"
        className="studio-secondary"
        disabled={!pending}
        onClick={() => {
          setSource(editor.getMarkdown());
          setPending(false);
          buffer.setPending(false);
          setError(false);
        }}
      >
        {e("reset")}
      </button>
      {error && <p role="alert">{e("invalid")}</p>}
    </div>
  );
}
