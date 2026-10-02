/** Four-language block authoring and live preview using the storefront renderer. */
import RichDescription, { type RichBlock } from "./RichDescription";
import { useOperationsText } from "./operations-i18n";
export default function RichEditor({
  value,
  onChange,
}: {
  value: Record<string, RichBlock[]>;
  onChange: (v: Record<string, RichBlock[]>) => void;
}) {
  const { o, locale } = useOperationsText();
  const lang = locale.slice(0, 2);
  const blocks = value?.[lang] ?? [];
  const save = (blocks: RichBlock[]) => onChange({ ...value, [lang]: blocks });
  return (
    <details>
      <summary>
        {o("rich")} · {lang.toUpperCase()}
      </summary>
      <p>{o("richHint")}</p>
      {blocks.map((b, i) => (
        <fieldset key={i}>
          <legend>{o(b.type)}</legend>
          <label>
            {o("paragraph")}
            <textarea
              value={b.text ?? ""}
              maxLength={4000}
              onChange={(e) =>
                save(
                  blocks.map((x, j) =>
                    j === i ? { ...x, text: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          {["image", "video"].includes(b.type) && (
            <label>
              URL
              <input
                type="url"
                value={b.url ?? ""}
                placeholder="https://"
                onChange={(e) =>
                  save(
                    blocks.map((x, j) =>
                      j === i ? { ...x, url: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
          )}
          <button
            type="button"
            className="studio-secondary"
            onClick={() => save(blocks.filter((_, j) => j !== i))}
          >
            {o("remove")}
          </button>
        </fieldset>
      ))}
      <div className="account-tabs">
        {(["paragraph", "heading", "list", "image", "video"] as const).map(
          (type) => (
            <button
              type="button"
              className="studio-secondary"
              key={type}
              disabled={blocks.length >= 40}
              onClick={() =>
                save([
                  ...blocks,
                  {
                    type,
                    text: "",
                    ...(["image", "video"].includes(type) ? { url: "" } : {}),
                  },
                ])
              }
            >
              + {o(type)}
            </button>
          ),
        )}
      </div>
      <RichDescription blocks={blocks} />
    </details>
  );
}
