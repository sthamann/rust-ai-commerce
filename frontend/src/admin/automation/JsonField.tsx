/** JSON editing retains incomplete input and invalidates the actual payload instead of silently saving the last valid value. */
import { useEffect, useRef, useState } from "react";
export default function JsonField({
  label,
  value,
  onChange,
  objectOnly = false,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
  objectOnly?: boolean;
}) {
  const encoded = JSON.stringify(value ?? {}, null, 2);
  const [draft, setDraft] = useState(encoded);
  const last = useRef(encoded);
  useEffect(() => {
    if (last.current !== encoded) {
      last.current = encoded;
      setDraft(encoded);
    }
  }, [encoded]);
  return (
    <label>
      {label}
      <textarea
        value={draft}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          try {
            const parsed = JSON.parse(text);
            if (
              objectOnly &&
              (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            )
              throw new Error("Object required");
            e.target.setCustomValidity("");
            last.current = JSON.stringify(parsed ?? {}, null, 2);
            onChange(parsed);
          } catch {
            e.target.setCustomValidity("JSON");
            last.current = JSON.stringify({}, null, 2);
            onChange(null);
          }
        }}
      />
    </label>
  );
}
