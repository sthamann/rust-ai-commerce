/** Safe structured editor rendering. Only known nodes/marks produce elements; URLs are never executable. */
import type { ReactNode } from "react";
export type RichNode = {
  type: string;
  text?: string;
  attrs?: Record<string, any>;
  content?: RichNode[];
  marks?: { type: string; attrs?: Record<string, any> }[];
};
export function safeRichUrl(url: string | undefined) {
  if (!url || url.length > 2000 || /[\\\r\n]/.test(url)) return false;
  if (url.startsWith("/store-api/assets/")) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function renderRichNode(
  node: RichNode,
  key: string | number = 0,
): ReactNode {
  const children = node.content?.map((n, i) =>
    renderRichNode(n, `${key}-${i}`),
  );
  const a = node.attrs ?? {};
  if (node.type === "text") {
    let text: ReactNode = node.text ?? "";
    for (const m of node.marks ?? []) {
      text =
        m.type === "bold" ? (
          <strong key={key}>{text}</strong>
        ) : m.type === "italic" ? (
          <em key={key}>{text}</em>
        ) : m.type === "underline" ? (
          <u key={key}>{text}</u>
        ) : m.type === "strike" ? (
          <s key={key}>{text}</s>
        ) : m.type === "code" ? (
          <code key={key}>{text}</code>
        ) : m.type === "link" && safeRichUrl(m.attrs?.href) ? (
          <a
            key={key}
            href={m.attrs!.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {text}
          </a>
        ) : (
          text
        );
    }
    return <span key={key}>{text}</span>;
  }
  switch (node.type) {
    case "doc":
      return <div key={key}>{children}</div>;
    case "paragraph":
      return <p key={key}>{children}</p>;
    case "heading":
      return a.level === 2 ? (
        <h2 key={key}>{children}</h2>
      ) : (
        <h3 key={key}>{children}</h3>
      );
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={Number(a.start) || 1}>
          {children}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children}</li>;
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      );
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "image":
      return safeRichUrl(a.src) ? (
        <img key={key} src={a.src} alt={a.alt ?? ""} loading="lazy" />
      ) : null;
    case "video":
      return safeRichUrl(a.src) ? (
        <video
          key={key}
          controls
          preload="metadata"
          src={a.src}
          aria-label={a.title ?? ""}
        />
      ) : null;
    default:
      return null;
  }
}
