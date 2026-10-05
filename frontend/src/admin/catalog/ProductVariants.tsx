/** Variant creation writes real child products through the same validated product aggregate API. */
import { useEffect, useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import { useCatalogText } from "./catalog-i18n";
import { languages, type ProductDraft } from "./catalog-model";
import PairFields from "./PairFields";
export default function ProductVariants({
  draft,
  request,
  onOpen,
}: {
  draft: ProductDraft;
  request: RequestFn;
  onOpen: (id: string) => void;
}) {
  const { c, money } = useCatalogText();
  const [items, setItems] = useState<any[]>([]);
  const [number, setNumber] = useState("");
  const [options, setOptions] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    request(
      `/api/merchant/products?limit=100&parentId=${encodeURIComponent(draft.id!)}`,
    )
      .then((v) => {
        if (active) setItems(v.elements);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [draft.id, request]);
  return (
    <>
      <p>{c("variantHint")}</p>
      {items.map((p) => (
        <button
          type="button"
          className="catalog-variant"
          key={p.id}
          onClick={() => onOpen(p.id)}
        >
          <strong>
            {Object.entries(p.options)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </strong>
          <span>
            {p.productNumber} · {money(p.price)} · {p.stock} {c("stock")}
          </span>
        </button>
      ))}
      <h3>{c("newVariant")}</h3>
      <label>
        {c("number")}
        <input value={number} onChange={(e) => setNumber(e.target.value)} />
      </label>
      <h4>{c("options")}</h4>
      <PairFields value={options} onChange={setOptions} />
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="studio-primary"
        disabled={busy || !number || !Object.keys(options).length}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const { id, channels: _channels, ...payload } = draft;
            const suffix = Object.values(options).join(" / ");
            const v = await request(
              "/api/merchant/products",
              {
                ...payload,
                revision: 0,
                translations: Object.fromEntries(
                  languages.map((l) => [
                    l,
                    {
                      ...draft.translations[l],
                      name: `${draft.translations[l].name} · ${suffix}`,
                    },
                  ]),
                ),
                catalog: {
                  ...draft.catalog,
                  active: false,
                  parentId: id,
                  productNumber: number,
                  options,
                },
              },
              "POST",
            );
            onOpen(v.id);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {c("newVariant")}
      </button>
    </>
  );
}
