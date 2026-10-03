/** MessageText keeps merchant interaction separate from workspace orchestration. */
export default function MessageText({ text }: { text: string }) {
  const pieces = text
    .replace(/^([ \t]*)[-*] +/gm, "$1• ")
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <p>
      {pieces.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : part.startsWith("`") && part.endsWith("`") ? (
          <code key={i}>{part.slice(1, -1)}</code>
        ) : (
          part
        ),
      )}
    </p>
  );
}
