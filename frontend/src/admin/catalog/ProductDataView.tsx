/** Central catalog workspace: server-filtered cursor list, product details and hierarchical categories. */
import { lazy, useEffect, useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import { useCatalogText } from "./catalog-i18n";
import type { Category } from "./catalog-model";
const ProductEditor = lazy(() => import("./ProductEditor"));
import CategoriesWorkspace from "./CategoriesWorkspace";
import "../styles/catalog.css";
import "../styles/catalog-editor.css";
export default function ProductDataView({
  request,
  initialId,
  onEntityBack,
}: {
  request: RequestFn;
  initialId?: string;
  onEntityBack?: () => void;
}) {
  const { c, money, locale } = useCatalogText();
  const [view, setView] = useState("products");
  const [id, setId] = useState<string | null>(null);
  useEffect(() => setId(initialId ?? null), [initialId]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [low, setLow] = useState(false);
  const [cursor, setCursor] = useState("");
  const [next, setNext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    request("/api/merchant/categories")
      .then((v) => {
        if (active) setCategories(v.elements);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request, reload]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () => {
        const q = new URLSearchParams({ limit: "25" });
        if (search.trim()) q.set("search", search.trim());
        if (status) q.set("active", String(status === "active"));
        if (category) q.set("categoryId", category);
        if (low) q.set("lowStock", "true");
        if (cursor) q.set("after", cursor);
        request(`/api/merchant/products?${q}`)
          .then((v) => {
            if (active) {
              setProducts(v.elements);
              setNext(v.nextCursor ?? "");
            }
          })
          .catch((e) => {
            if (active) setError(e.message);
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
      search ? 220 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [request, search, status, category, low, cursor, reload]);
  const change = (fn: () => void) => {
    setCursor("");
    fn();
  };
  if (id !== null)
    return (
      <ProductEditor
        key={id}
        id={id}
        request={request}
        categories={categories}
        onBack={() => {
          if (onEntityBack) {
            onEntityBack();
            return;
          }
          setId(null);
          setReload((v) => v + 1);
        }}
        onCreated={setId}
      />
    );
  return (
    <div className="studio-page catalog-workspace">
      <div className="catalog-heading">
        <div>
          <p className="catalog-eyebrow">{c("products")}</p>
          <h1>{c("products")}</h1>
          <p>{c("intro")}</p>
        </div>
        {view === "products" && (
          <button className="studio-primary" onClick={() => setId("")}>
            + {c("newProduct")}
          </button>
        )}
      </div>
      <div className="catalog-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={view === "products"}
          onClick={() => setView("products")}
        >
          {c("products")}
        </button>
        <button
          role="tab"
          aria-selected={view === "categories"}
          onClick={() => setView("categories")}
        >
          {c("categories")}
        </button>
      </div>
      {view === "categories" ? (
        <CategoriesWorkspace
          request={request}
          categories={categories}
          onRefresh={() => setReload((v) => v + 1)}
        />
      ) : (
        <>
          <section className="studio-card catalog-filters">
            <label className="catalog-search">
              {c("search")}
              <input
                type="search"
                value={search}
                onChange={(e) => change(() => setSearch(e.target.value))}
              />
            </label>
            <label>
              {c("status")}
              <select
                value={status}
                onChange={(e) => change(() => setStatus(e.target.value))}
              >
                <option value="">{c("all")}</option>
                <option value="active">{c("active")}</option>
                <option value="inactive">{c("inactive")}</option>
              </select>
            </label>
            <label>
              {c("categories")}
              <select
                value={category}
                onChange={(e) => change(() => setCategory(e.target.value))}
              >
                <option value="">{c("all")}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.data.translations[locale.slice(0, 2)]?.name ??
                      cat.data.translations.en.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={low}
                onChange={(e) => change(() => setLow(e.target.checked))}
              />
              {c("lowStock")}
            </label>
          </section>
          {error && (
            <p role="alert" className="catalog-error">
              {error}
            </p>
          )}
          <section
            className="studio-card catalog-table-wrap"
            aria-busy={loading}
          >
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>{c("name")}</th>
                  <th>{c("number")}</th>
                  <th>{c("status")}</th>
                  <th>{c("price")}</th>
                  <th>{c("stock")}</th>
                  <th>{c("variants")}</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button
                        className="catalog-product-link"
                        onClick={() => setId(p.id)}
                      >
                        {p.media?.[0]?.url ? (
                          <img src={p.media[0].url} alt="" />
                        ) : (
                          <span className="catalog-thumbnail">◇</span>
                        )}
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {(p.categoryIds ?? [])
                              .map((id: string) => {
                                const category = categories.find(
                                  (c) => c.id === id,
                                );
                                return (
                                  category?.data.translations[
                                    locale.slice(0, 2)
                                  ]?.name ?? category?.data.translations.en.name
                                );
                              })
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>{p.productNumber}</td>
                    <td>
                      <span
                        className={`catalog-badge ${p.active ? "is-active" : ""}`}
                      >
                        {c(p.active ? "active" : "inactive")}
                      </span>
                    </td>
                    <td>{money(p.price)}</td>
                    <td>
                      <span className={p.stock <= 5 ? "catalog-low" : ""}>
                        {p.stock}
                      </span>
                    </td>
                    <td>{p.variantCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!products.length && !loading && !error && (
              <div className="catalog-empty">
                <h2>{c("empty")}</h2>
                <button className="studio-primary" onClick={() => setId("")}>
                  {c("newProduct")}
                </button>
              </div>
            )}
            {loading && <p role="status">{c("loading")}</p>}
            <div className="catalog-pagination">
              <span>
                {products.length} {c("products")}
              </span>
              <div>
                {cursor && (
                  <button
                    className="studio-secondary"
                    onClick={() => setCursor("")}
                  >
                    {c("first")}
                  </button>
                )}
                {next && (
                  <button
                    className="studio-secondary"
                    disabled={loading}
                    onClick={() => setCursor(next)}
                  >
                    {c("next")} →
                  </button>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
