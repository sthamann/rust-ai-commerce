/** Lossless import of legacy blocks into structured WYSIWYG content, preserving inline emphasis. */
import type { RichBlock } from "../RichDescription";
import type { RichNode } from "../rich-document";
function inline(text: string): RichNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .filter(Boolean)
    .map((t) =>
      t.startsWith("**")
        ? { type: "text", text: t.slice(2, -2), marks: [{ type: "bold" }] }
        : t.startsWith("*")
          ? { type: "text", text: t.slice(1, -1), marks: [{ type: "italic" }] }
          : { type: "text", text: t },
    );
}
export function editorDocument(blocks: RichBlock[], fallback = ""): RichNode {
  const doc = blocks.find((b) => b.type === "document")?.doc;
  if (doc) return doc;
  return {
    type: "doc",
    content: blocks.length
      ? blocks.map((b) =>
          b.type === "heading"
            ? {
                type: "heading",
                attrs: { level: 3 },
                content: inline(b.text ?? ""),
              }
            : b.type === "list"
              ? {
                  type: "bulletList",
                  content: (b.text ?? "").split("\n").map((t) => ({
                    type: "listItem",
                    content: [{ type: "paragraph", content: inline(t) }],
                  })),
                }
              : ["image", "video"].includes(b.type)
                ? {
                    type: b.type,
                    attrs: {
                      src: b.url,
                      alt: b.text ?? "",
                      title: b.text ?? "",
                    },
                  }
                : { type: "paragraph", content: inline(b.text ?? "") },
        )
      : [{ type: "paragraph", content: inline(fallback) }],
  };
}
