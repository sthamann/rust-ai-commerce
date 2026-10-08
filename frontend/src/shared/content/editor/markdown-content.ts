/** Markdown admission shares the public rich-document node/URL boundary; rich-only features never silently disappear. */
import { safeRichUrl, type RichNode } from "../rich-document";
export function markdownCompatible(node: RichNode): boolean {
  return (
    node.type !== "video" &&
    !(
      node.type === "image" &&
      (node.attrs?.width != null || node.attrs?.height != null)
    ) &&
    !(node.marks ?? []).some((m) => m.type === "underline") &&
    (node.content ?? []).every(markdownCompatible)
  );
}
export function safeMarkdownDocument(
  node: RichNode,
  depth = 0,
  counter = { nodes: 0 },
): boolean {
  if (depth > 10 || ++counter.nodes > 400) return false;
  if (
    node.type === "text" &&
    (typeof node.text !== "string" ||
      new TextEncoder().encode(node.text).length > 4000)
  )
    return false;
  if (
    node.attrs &&
    Object.keys(node.attrs).some(
      (k) =>
        ![
          "level",
          "start",
          "src",
          "alt",
          "title",
          "width",
          "height",
          "language",
        ].includes(k),
    )
  )
    return false;
  return (
    [
      "doc",
      "text",
      "paragraph",
      "heading",
      "bulletList",
      "orderedList",
      "listItem",
      "blockquote",
      "codeBlock",
      "hardBreak",
      "horizontalRule",
      "image",
    ].includes(node.type) &&
    (node.type !== "heading" || [2, 3].includes(node.attrs?.level)) &&
    (node.type !== "image" || safeRichUrl(node.attrs?.src)) &&
    (node.marks ?? []).every(
      (m) =>
        ["bold", "italic", "strike", "code", "link"].includes(m.type) &&
        (!m.attrs ||
          Object.keys(m.attrs).every((k) =>
            ["href", "target", "rel", "class"].includes(k),
          )) &&
        (m.type !== "link" || safeRichUrl(m.attrs?.href)),
    ) &&
    (node.content ?? []).every((child) =>
      safeMarkdownDocument(child, depth + 1, counter),
    )
  );
}
