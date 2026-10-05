/** Safe rich blocks with native image/video rendering; no HTML interpretation or script execution. */
import { renderRichNode, safeRichUrl, type RichNode } from "./rich-document";
export type RichBlock = {
  type: "paragraph" | "heading" | "list" | "image" | "video" | "document";
  doc?: RichNode;
  text?: string;
  url?: string;
};
function inline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .map((p, i) =>
      p.startsWith("**") ? (
        <strong key={i}>{p.slice(2, -2)}</strong>
      ) : p.startsWith("*") ? (
        <em key={i}>{p.slice(1, -1)}</em>
      ) : (
        p
      ),
    );
}
export default function RichDescription({ blocks }: { blocks: RichBlock[] }) {
  return (
    <div className="rich-description">
      {blocks.map((b, i) =>
        b.type === "document" && b.doc ? (
          renderRichNode(b.doc, i)
        ) : b.type === "heading" ? (
          <h3 key={i}>{inline(b.text ?? "")}</h3>
        ) : b.type === "list" ? (
          <ul key={i}>
            {(b.text ?? "").split("\n").map((t, j) => (
              <li key={j}>{inline(t)}</li>
            ))}
          </ul>
        ) : b.type === "image" && safeRichUrl(b.url) ? (
          <figure key={i}>
            <img src={b.url} alt={b.text ?? ""} loading="lazy" />
            {b.text && <figcaption>{b.text}</figcaption>}
          </figure>
        ) : b.type === "video" && safeRichUrl(b.url) ? (
          <figure key={i}>
            <video
              controls
              preload="metadata"
              src={b.url}
              aria-label={b.text}
            />
            {b.text && <figcaption>{b.text}</figcaption>}
          </figure>
        ) : (
          <p key={i}>{inline(b.text ?? "")}</p>
        ),
      )}
    </div>
  );
}
