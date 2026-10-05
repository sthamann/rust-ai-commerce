/** Accessible key/value rows for product properties, specifications and variant options. */
import { useCatalogText } from "./catalog-i18n";
export default function PairFields({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const { c } = useCatalogText();
  const entries = Object.entries(value);
  return (
    <div className="catalog-pairs">
      {entries.map(([k, v], i) => (
        <div className="catalog-pair" key={i}>
          <label>
            {c("key")}
            <input
              value={k}
              onChange={(e) => {
                const next = [...entries];
                next[i] = [e.target.value, v];
                onChange(Object.fromEntries(next));
              }}
            />
          </label>
          <label>
            {c("value")}
            <input
              value={v}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })}
            />
          </label>
          <button
            type="button"
            className="studio-secondary"
            aria-label={`${c("remove")} ${k}`}
            onClick={() =>
              onChange(Object.fromEntries(entries.filter((_, j) => j !== i)))
            }
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="studio-secondary"
        onClick={() =>
          onChange({ ...value, [" ".repeat(entries.length + 1)]: "" })
        }
      >
        + {c("add")}
      </button>
    </div>
  );
}
