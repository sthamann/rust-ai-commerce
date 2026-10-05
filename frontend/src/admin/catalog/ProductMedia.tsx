/** Ordered image gallery metadata editing, independent of product pricing and translations. */
import { useCatalogText } from "./catalog-i18n";
import type { ProductDraft } from "./catalog-model";
export default function ProductMedia({
  draft: d,
  onChange,
}: {
  draft: ProductDraft;
  onChange: (d: ProductDraft) => void;
}) {
  const { c } = useCatalogText();
  return (
    <>
      {d.commerce.media.map((m: any, i: number) => (
        <div className="catalog-media-row" key={i}>
          {m.url && <img src={m.url} alt={m.view ?? ""} />}
          <label>
            {c("url")}
            <input
              value={m.url}
              onChange={(e) =>
                onChange({
                  ...d,
                  commerce: {
                    ...d.commerce,
                    media: d.commerce.media.map((v: any, n: number) =>
                      n === i ? { ...v, url: e.target.value } : v,
                    ),
                  },
                })
              }
            />
          </label>
          <label>
            {c("alt")}
            <input
              value={m.view}
              onChange={(e) =>
                onChange({
                  ...d,
                  commerce: {
                    ...d.commerce,
                    media: d.commerce.media.map((v: any, n: number) =>
                      n === i ? { ...v, view: e.target.value } : v,
                    ),
                  },
                })
              }
            />
          </label>
          {i > 0 && (
            <button
              type="button"
              className="studio-secondary"
              aria-label={`${c("position")} ${i}`}
              onClick={() => {
                const media = [...d.commerce.media];
                [media[i - 1], media[i]] = [media[i], media[i - 1]];
                onChange({ ...d, commerce: { ...d.commerce, media } });
              }}
            >
              ↑
            </button>
          )}
          <button
            type="button"
            className="studio-secondary"
            onClick={() =>
              onChange({
                ...d,
                commerce: {
                  ...d.commerce,
                  media: d.commerce.media.filter(
                    (_: any, n: number) => n !== i,
                  ),
                },
              })
            }
          >
            {c("remove")}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="studio-secondary"
        onClick={() =>
          onChange({
            ...d,
            commerce: {
              ...d.commerce,
              media: [
                ...d.commerce.media,
                { id: crypto.randomUUID(), url: "", view: "" },
              ],
            },
          })
        }
      >
        + {c("image")}
      </button>
    </>
  );
}
