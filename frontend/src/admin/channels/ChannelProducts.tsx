/** Search-based channel product assignment, preserving selected IDs across server-filtered result pages. */
import { useEffect, useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import { useChannelText } from "./channel-i18n";
export default function ChannelProducts({
  request,
  value,
  onChange,
}: {
  request: RequestFn;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const t = useChannelText(),
    [search, setSearch] = useState(""),
    [items, setItems] = useState<any[]>([]),
    [names, setNames] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      request(
        `/api/merchant/products?limit=25&search=${encodeURIComponent(search)}`,
      )
        .then((v) => {
          if (active) {
            setItems(v.elements);
            setNames((old) => ({
              ...old,
              ...Object.fromEntries(v.elements.map((p: any) => [p.id, p.name])),
            }));
            setError("");
          }
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
    <div>
      <label>
        {t("search")}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="channel-product-chips">
        {value.map((id) => (
          <button
            type="button"
            className="studio-secondary"
            key={id}
            aria-label={`${t("remove")} ${names[id] ?? id}`}
            onClick={() => onChange(value.filter((v) => v !== id))}
          >
            {names[id] ?? id} ×
          </button>
        ))}
      </div>
      <div className="channel-product-results">
        {items
          .filter((p) => !value.includes(p.id))
          .map((p) => (
            <button
              type="button"
              className="search-hit"
              key={p.id}
              disabled={value.length >= 500}
              onClick={() => onChange([...value, p.id])}
            >
              <strong>{p.name}</strong>
              <small>
                {p.productNumber} · {t("add")} +
              </small>
            </button>
          ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
