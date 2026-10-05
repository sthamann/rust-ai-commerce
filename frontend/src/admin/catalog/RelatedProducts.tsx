/** Search-backed related-product selection, avoiding comma-separated opaque IDs. */
import { useEffect, useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import { useCatalogText } from "./catalog-i18n";
export default function RelatedProducts({
  request,
  id,
  value,
  onChange,
}: {
  request: RequestFn;
  id: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { c } = useCatalogText();
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      request(
        `/api/merchant/products?limit=100&search=${encodeURIComponent(search)}`,
      )
        .then((v) => {
          if (active) setProducts(v.elements);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [request, search]);
  return (
    <>
      <label>
        {c("search")}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="catalog-category-checks">
        {products
          .filter((p) => p.id !== id)
          .map((p) => (
            <label key={p.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={value.includes(p.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, p.id]
                      : value.filter((v) => v !== p.id),
                  )
                }
              />
              {p.name} · {p.productNumber}
            </label>
          ))}
      </div>
      {value
        .filter((v) => !products.some((p) => p.id === v))
        .map((v) => (
          <button
            type="button"
            className="studio-secondary"
            key={v}
            onClick={() => onChange(value.filter((id) => id !== v))}
          >
            {v} ×
          </button>
        ))}
    </>
  );
}
