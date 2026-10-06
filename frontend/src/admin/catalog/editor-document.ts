/** Canonical transport drops editor-only null attributes; description headings remain within the native H2/H3 contract. */
import type { RichNode } from "../../shared/content/rich-document";
export function editorTransport(node: RichNode): RichNode {
  const attrs =
    node.attrs &&
    Object.fromEntries(Object.entries(node.attrs).filter(([, v]) => v != null));
  if (node.type === "heading" && attrs)
    attrs.level = Math.min(3, Math.max(2, Number(attrs.level) || 2));
  return {
    ...node,
    ...(attrs ? { attrs } : {}),
    ...(node.marks
      ? {
          marks: node.marks.map((mark) => ({
            ...mark,
            ...(mark.attrs
              ? {
                  attrs: Object.fromEntries(
                    Object.entries(mark.attrs).filter(([, v]) => v != null),
                  ),
                }
              : {}),
          })),
        }
      : {}),
    ...(node.content ? { content: node.content.map(editorTransport) } : {}),
  };
}
