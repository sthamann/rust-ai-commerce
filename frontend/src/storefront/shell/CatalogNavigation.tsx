/** Public category navigation uses the same tenant/channel tree as the listing API, with translated names. */
import { useEffect, useState } from "react";
import { shopApi } from "../../shared/api/shop-api";
import { useStorefront } from "./StorefrontContext";
type Category = {
  id: string;
  parentId: string | null;
  name: string;
  description?: string;
  type: string;
  url?: string;
};
export default function CatalogNavigation() {
  const { s, locale, category, setCategory, salesChannel } = useStorefront();
  const [items, setItems] = useState<Category[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    shopApi<{ elements: Category[] }>("/store-api/navigation", {})
      .then((v) => {
        if (active) {
          setItems(v.elements);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [locale, salesChannel]);
  const ordered: Category[] = [];
  const visit = (parentId: string | null) => {
    for (const item of items.filter(
      (c) =>
        c.parentId === parentId ||
        (parentId === null && !items.some((p) => p.id === c.parentId)),
    )) {
      ordered.push(item);
      visit(item.id);
    }
  };
  visit(null);
  const selected = items.find((c) => c.id === category);
  const depth = (c: Category) => {
    let n = 0,
      p = c.parentId;
    const seen = new Set<string>();
    while (p && !seen.has(p)) {
      seen.add(p);
      const parent = items.find((i) => i.id === p);
      if (!parent) break;
      ++n;
      p = parent.parentId;
    }
    return Math.max(0, n - 1);
  };
  return (
    <div>
      <nav className="shop-category-navigation" aria-label={s("collection")}>
        <button
          aria-pressed={category === "all"}
          onClick={() => setCategory("all")}
        >
          {s("all")}
        </button>
        {ordered
          .filter((c) => c.parentId && items.some((i) => i.id === c.parentId))
          .map((c) =>
            c.type === "link" ? (
              <a
                key={c.id}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {c.name}
              </a>
            ) : ["structuring", "folder"].includes(c.type) ? (
              <span key={c.id}>{c.name}</span>
            ) : (
              <button
                key={c.id}
                style={{ marginInlineStart: depth(c) * 12 }}
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.name}
              </button>
            ),
          )}
      </nav>
      {selected && (
        <div className="shop-category-description">
          <h3>{selected.name}</h3>
          {selected.description && <p>{selected.description}</p>}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
