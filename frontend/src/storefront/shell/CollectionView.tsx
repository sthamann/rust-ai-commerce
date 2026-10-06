/** CollectionView: storefront view composed from the scoped cart/controller. */
import { productURL } from "../catalog/product-url";
import { BRAND } from "../../shared/ui/Brand";
import ImagePlaceholder from "../catalog/ImagePlaceholder";
import CatalogNavigation from "./CatalogNavigation";
import "../../shared/styles/apps.css";
import "../../shared/styles/workbench.css";
import Icon from "../../shared/ui/Icon";
import "../styles/shop.css";

import { useStorefront } from "./StorefrontContext";
export default function CollectionView() {
  const {
    s,
    adapted,
    experience,
    query,
    setQuery,
    catalogLoading,
    list,
    setViewed,
    money,
    cart,
    pageCursor,
    busy,
    run,
    catalog,
    nextCursor,
  } = useStorefront();
  return (
    <section className="shop-collection" id="collection">
      <div className="collection-title">
        <div>
          <p className="shop-kicker">
            {BRAND.name} / {s("collection")}
          </p>
          <h2>{s("collection")}</h2>
        </div>
        <span>
          {adapted
            ? s("adapted")
            : s(
                experience?.variant === "comparison"
                  ? "comparison"
                  : "discovery",
              )}
        </span>
      </div>
      <div className="shop-filters">
        <CatalogNavigation />
        <input
          aria-label={s("search")}
          placeholder={s("search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div
        aria-busy={catalogLoading}
        className={`shop-grid ${experience?.variant === "comparison" || query.length > 3 ? "comparison" : ""}`}
      >
        {list.map((p) => (
          <article
            key={p.id}
            className="shop-product"
            onMouseEnter={() =>
              setViewed((v) => ({
                ...v,
                [p.category]: (v[p.category] ?? 0) + 1,
              }))
            }
          >
            <a
              className="shop-product-image"
              href={productURL(p)}
              aria-label={`${s("details")}: ${p.name}`}
            >
              {p.media[0]?.url ? (
                <img
                  src={p.media[0].url}
                  alt={p.name}
                  loading="lazy"
                  width="400"
                  height="320"
                />
              ) : (
                <ImagePlaceholder label={s("noImage")} />
              )}
              <span>
                {p.stock ? `${p.stock} ${s("available")}` : s("sold")}
              </span>
            </a>
            <div className="shop-product-info">
              <p className="shop-kicker">{s(p.category)}</p>
              <a href={productURL(p)}>
                <h3>{p.name}</h3>
              </a>
              <p>{p.description}</p>
              <strong>{money(p.calculated_price?.unitPrice ?? p.price)}</strong>
              <small>
                {s(cart?.customerGroup === "business" ? "net" : "gross")}
              </small>
            </div>
            <a className="shop-product-link" href={productURL(p)}>
              {s("details")}
              <Icon name="arrow" size={18} />
            </a>
          </article>
        ))}
      </div>
      <div className="shop-filters">
        {catalogLoading && <p role="status">{s("loading")}</p>}
        {pageCursor && (
          <button
            disabled={catalogLoading || busy}
            onClick={() => run(() => catalog(cart?.token))}
          >
            {s("firstPage")}
          </button>
        )}
        {nextCursor && (
          <button
            disabled={catalogLoading || busy}
            onClick={() => run(() => catalog(cart?.token, nextCursor))}
          >
            {s("nextPage")} →
          </button>
        )}
      </div>
    </section>
  );
}
