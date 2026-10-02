import { responseError } from "./errors-i18n";
import { useEffect, useState, useRef } from "react";
import { locales, type Locale } from "./i18n";
import { useShopText } from "./shop-i18n";
import {
  shopApi,
  type Product,
  type Cart,
  type Order,
  type Selection,
} from "./shop-api";
import ShopAnalytics, { commerceEvent } from "./ShopAnalytics";
import Art from "./ProductArt";
import Icon from "./Icon";
import CustomerAccount from "./CustomerAccount";
import ProductPage from "./ProductPage";
import PaymentSession from "./PaymentSession";
import "./apps.css";
import CheckoutPanel from "./CheckoutPanel";
import "./shop.css";
import "./workbench.css";
import { useWorkbenchText } from "./workbench-i18n";
const session = localStorage.getItem("rac-session") || crypto.randomUUID();
localStorage.setItem("rac-session", session);
function productId() {
  try {
    return location.hash.startsWith("#product/")
      ? decodeURIComponent(location.hash.slice(9))
      : "";
  } catch {
    return "";
  }
}
export default function Storefront({ onMerchant }: { onMerchant: () => void }) {
  const { s, t, money, locale, setLocale } = useShopText();
  const { w } = useWorkbenchText();
  const shopTenant =
    new URLSearchParams(location.search).get("shop") ?? "atelier";
  const salesChannel =
    new URLSearchParams(location.search).get("channel") ?? "default";
  const cartKey =
    salesChannel === "default"
      ? `rac-cart:${shopTenant}`
      : `rac-cart:${shopTenant}:${salesChannel}`;
  const transfer = useRef<{ ticket: string; promise: Promise<Cart> } | null>(
    null,
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Cart>();
  const [id, setId] = useState(productId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bag, setBag] = useState(false);
  const [account, setAccount] = useState(false);
  const [order, setOrder] = useState<Order>();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageCursor, setPageCursor] = useState<string>();
  const [catalogLoading, setCatalogLoading] = useState(false);
  const catalogRequest = useRef(0);
  const [wish, setWish] = useState("");
  const [advice, setAdvice] = useState<{
    explanation: string;
    recommended_ids: string[];
  }>();
  const [ranked, setRanked] = useState<string[]>([]);
  const [personalized, setPersonalized] = useState(false);
  const [adaptation, setAdaptation] = useState(
    localStorage.getItem(`rac-adaptation:${shopTenant}`) === "1",
  );
  const [viewed, setViewed] = useState<Record<string, number>>({});
  const [experience, setExperience] = useState<{
    variant: string;
    headline?: string;
  }>();
  const save = (c: Cart) => {
    setCart(c);
    localStorage.setItem(cartKey, c.token);
  };
  const catalog = async (token?: string, after?: string) => {
    const request = ++catalogRequest.current;
    setCatalogLoading(true);
    try {
      const page = await shopApi<{
        elements: Product[];
        nextCursor: string | null;
      }>(
        "/store-api/product",
        {
          limit: 50,
          after,
          search: query.trim() || undefined,
          category: category === "all" ? undefined : category,
        },
        token,
      );
      if (request === catalogRequest.current) {
        setProducts(page.elements);
        setNextCursor(page.nextCursor);
        setPageCursor(after);
      }
    } finally {
      if (request === catalogRequest.current) setCatalogLoading(false);
    }
  };
  useEffect(() => {
    if (!cart) return;
    let active = true;
    const timer = window.setTimeout(
      () => {
        catalog(cart.token).catch((e) => {
          if (active) setError((e as Error).message);
        });
      },
      query ? 200 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
      ++catalogRequest.current;
    };
  }, [
    query,
    category,
    locale,
    cart?.token,
    cart?.customerGroup,
    cart?.checkout.country,
  ]);
  useEffect(() => {
    const hash = () => {
      setId(productId());
      if (productId()) window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", hash);
    return () => window.removeEventListener("hashchange", hash);
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = localStorage.getItem(cartKey);
        let c: Cart;
        const ticket = location.hash.startsWith("#checkout/")
          ? location.hash.slice(10)
          : undefined;
        if (ticket) {
          if (transfer.current?.ticket !== ticket)
            transfer.current = {
              ticket,
              promise: shopApi<Cart>("/store-api/checkout/handoff/consume", {
                ticket,
              }),
            };
          c = await transfer.current.promise;
          localStorage.setItem(cartKey, c.token);
          history.replaceState(
            null,
            "",
            `${location.pathname}${location.search}#`,
          );
          setBag(true);
        } else
          try {
            c = await shopApi<Cart>(
              "/store-api/checkout/cart",
              token ? undefined : { session },
              token ?? undefined,
            );
            if (c.status !== "open" && !location.hash.startsWith("#payment/"))
              c = await shopApi<Cart>("/store-api/checkout/cart", { session });
          } catch {
            c = await shopApi<Cart>("/store-api/checkout/cart", { session });
          }
        if (!active) return;
        save(c);
        const exp = await shopApi<{ variant: string; headline?: string }>(
          "/api/experience",
          { session },
        );
        if (active) setExperience(exp);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [locale]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const add = (pid: string, q: number) =>
    run(async () => {
      if (!cart) return;
      save(
        await shopApi<Cart>(
          "/store-api/checkout/cart/line-item",
          { items: [{ referencedId: pid, quantity: q }] },
          cart.token,
        ),
      );
      const item = products.find((p) => p.id === pid);
      const actual = cart.lineItems.find((i) => i.id === pid);
      commerceEvent("add_to_cart", {
        items: [
          {
            item_id: pid,
            item_name: item?.name ?? actual?.label ?? pid,
            price:
              item?.calculated_price?.unitPrice ??
              item?.price ??
              actual?.price.unitPrice ??
              0,
            quantity: q,
          },
        ],
      });
      setBag(true);
      setOrder(undefined);
    });
  const quantity = (pid: string, q: number) =>
    run(async () => {
      if (!cart) return;
      save(
        await shopApi<Cart>(
          "/store-api/checkout/cart",
          {
            revision: cart.revision,
            items: cart.lineItems
              .map((i) => ({
                id: i.id,
                quantity: i.id === pid ? q : i.quantity,
              }))
              .filter((i) => i.quantity > 0),
          },
          cart.token,
          "PUT",
        ),
      );
    });
  const selection = async (checkout: Selection) => {
    if (!cart) return;
    save(
      await shopApi<Cart>(
        "/store-api/checkout/context",
        { revision: cart.revision, checkout },
        cart.token,
        "PUT",
      ),
    );
  };
  const buy = () =>
    run(async () => {
      if (!cart) return;
      const r = await fetch("/store-api/checkout/order", {
        method: "POST",
        headers: {
          "sw-context-token": cart.token,
          "Idempotency-Key": `browser-${cart.id}`,
          "x-commerce-locale": locale,
          "x-tenant": shopTenant,
          "sw-sales-channel-id": salesChannel,
          ...(new URLSearchParams(location.search).get("sandbox") === "1"
            ? {
                Authorization: `Bearer ${sessionStorage.getItem("rac-user-token")}`,
              }
            : {}),
        },
      });
      const o = await r.json();
      if (!r.ok)
        throw responseError(o.errors?.[0]?.detail ?? "Order failed", r.status);
      setOrder(o);
      if (o.payment.attemptId) {
        setCart(
          await shopApi<Cart>(
            "/store-api/checkout/cart",
            undefined,
            cart.token,
          ),
        );
        localStorage.setItem(
          `rac-payment-token:${o.payment.attemptId}`,
          cart.token,
        );
        return;
      }
      const next = await shopApi<Cart>("/store-api/checkout/cart", { session });
      save(next);
    });
  useEffect(() => {
    if (!adaptation || !cart || !id) return;
    let active = true;
    shopApi<{ rankedProductIds: string[]; adapted: boolean }>(
      "/store-api/personalization/events",
      {
        productId: id,
        eventId: crypto.randomUUID().replaceAll("-", ""),
        kind: "view",
      },
      cart.token,
    )
      .then((v) => {
        if (active) {
          setRanked(v.rankedProductIds);
          setPersonalized(v.adapted);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id, adaptation, cart?.id]);
  const affinity = Object.entries(viewed).sort((a, b) => b[1] - a[1])[0];
  const adapted =
    adaptation && (personalized || (!!affinity && affinity[1] >= 3));
  const rank = (id: string) => {
    const index = ranked.indexOf(id);
    return index < 0 ? ranked.length : index;
  };
  const list = [...products].sort((a, b) =>
    adaptation && ranked.length
      ? rank(a.id) - rank(b.id)
      : adapted && affinity
        ? Number(b.category === affinity[0]) -
          Number(a.category === affinity[0])
        : 0,
  );
  return (
    <div className="shop">
      <ShopAnalytics
        shop={shopTenant}
        channel={salesChannel}
        products={products}
        cart={cart}
        bag={bag}
        order={order}
      />
      {new URLSearchParams(location.search).get("sandbox") === "1" && (
        <div className="sandbox-banner">
          {w("stage")} · {w("exclusion")}
        </div>
      )}
      <header className="shop-nav">
        <a href="#" className="shop-brand">
          atelier<span> / </span>
        </a>
        <nav>
          <a href="#">{s("collection")}</a>
          <button
            disabled={busy || !cart}
            onClick={() =>
              run(async () => {
                if (!cart || cart.customerGroup === "business") return;
                const c = await shopApi<Cart>(
                  "/store-api/account/login",
                  { email: "buyer@example.test", password: "demo-business" },
                  cart.token,
                );
                save(c);
              })
            }
          >
            {cart?.customerGroup === "business"
              ? "Example Studio · B2B"
              : s("business")}
          </button>
          <button onClick={() => setAccount(true)}>{w("account")}</button>
          <button onClick={onMerchant}>{s("studio")} ↗</button>
        </nav>
        <select
          aria-label={t("language")}
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          {Object.entries(locales).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button
          className="shop-text-button"
          aria-pressed={adaptation}
          onClick={() => {
            const enabled = !adaptation;
            setAdaptation(enabled);
            localStorage.setItem(
              `rac-adaptation:${shopTenant}`,
              enabled ? "1" : "0",
            );
            if (!enabled) {
              setRanked([]);
              setPersonalized(false);
              setViewed({});
              if (cart)
                void shopApi(
                  "/store-api/personalization",
                  undefined,
                  cart.token,
                  "DELETE",
                ).catch(() => {});
            }
          }}
        >
          {w(adaptation ? "adaptationOn" : "adaptationOff")}
        </button>
        <button className="shop-bag-button" onClick={() => setBag(true)}>
          <Icon name="box" size={18} />
          {s("bag")}{" "}
          <b>{cart?.lineItems.reduce((n, i) => n + i.quantity, 0) ?? 0}</b>
        </button>
      </header>
      {error && (
        <div role="alert" className="shop-error">
          {error}
          <button aria-label={s("close")} onClick={() => setError("")}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {location.hash.startsWith("#payment/") &&
      localStorage.getItem(`rac-payment-token:${location.hash.slice(9)}`) ? (
        <main className="shop-content">
          <PaymentSession
            id={location.hash.slice(9)}
            token={localStorage.getItem(
              `rac-payment-token:${location.hash.slice(9)}`,
            )!}
          />
        </main>
      ) : id ? (
        <ProductPage
          id={id}
          cart={cart}
          busy={busy}
          onAdd={add}
          onCart={save}
        />
      ) : (
        <main className="shop-content">
          <section className="shop-hero">
            <div>
              <p className="shop-kicker">ATELIER / {w("consideredObjects")}</p>
              <h1>
                {experience?.headline &&
                experience.headline !==
                  "Objects for a more considered everyday."
                  ? experience.headline
                  : s("hero")}
              </h1>
              <p>{s("intro")}</p>
              <a className="shop-primary" href="#collection">
                {s("explore")}
                <Icon name="arrow" />
              </a>
            </div>
            <div className="shop-hero-art">
              <Art id="chair" />
              <span>
                01 /{" "}
                {products.find((p) => p.id === "chair")?.name ?? s("furniture")}
              </span>
            </div>
          </section>
          <section className="shop-concierge">
            <div>
              <p className="shop-kicker">{s("ask")}</p>
              <p>{s("wish")}</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  const v = await shopApi<{
                    answer: { explanation: string; recommended_ids: string[] };
                  }>("/api/concierge", { request: wish }, cart?.token);
                  setAdvice(v.answer);
                  setQuery("");
                  setCategory("all");
                });
              }}
            >
              <input
                aria-label={s("ask")}
                value={wish}
                onChange={(e) => setWish(e.target.value)}
                placeholder={s("wish")}
              />
              <button disabled={busy || !wish} className="shop-secondary">
                {busy ? s("thinking") : s("ask")} ↗
              </button>
            </form>
            {advice && (
              <div className="shop-advice" role="status">
                <p>{advice.explanation}</p>
                {advice.recommended_ids.map((pid) => (
                  <a key={pid} href={`#product/${pid}`}>
                    {products.find((p) => p.id === pid)?.name} ↗
                  </a>
                ))}
              </div>
            )}
          </section>
          <section className="shop-collection" id="collection">
            <div className="collection-title">
              <div>
                <p className="shop-kicker">ATELIER / {s("collection")}</p>
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
              <div>
                {["all", "furniture", "lighting", "objects"].map((c) => (
                  <button
                    key={c}
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                  >
                    {s(c)}
                  </button>
                ))}
              </div>
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
                    href={`#product/${p.id}`}
                    aria-label={`${s("details")}: ${p.name}`}
                  >
                    <img
                      src={p.media[0]?.url ?? `/media/${p.id}-front.svg`}
                      alt={p.name}
                      loading="lazy"
                      width="400"
                      height="320"
                    />
                    <span>
                      {p.stock ? `${p.stock} ${s("available")}` : s("sold")}
                    </span>
                  </a>
                  <div className="shop-product-info">
                    <p className="shop-kicker">{s(p.category)}</p>
                    <a href={`#product/${p.id}`}>
                      <h3>{p.name}</h3>
                    </a>
                    <p>{p.description}</p>
                    <strong>
                      {money(p.calculated_price?.unitPrice ?? p.price)}
                    </strong>
                    <small>
                      {s(cart?.customerGroup === "business" ? "net" : "gross")}
                    </small>
                  </div>
                  <a className="shop-product-link" href={`#product/${p.id}`}>
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
        </main>
      )}
      <footer className="shop-footer">
        <strong>atelier /</strong>
        <p>{s("simulation")}</p>
        <a href="https://github.com/sthamann/rust-ai-commerce">GitHub ↗</a>
      </footer>
      {account && (
        <CustomerAccount
          cart={cart}
          onCart={save}
          onClose={() => setAccount(false)}
        />
      )}
      {bag && (
        <CheckoutPanel
          cart={cart}
          order={order}
          busy={busy}
          onClose={() => setBag(false)}
          onQuantity={quantity}
          onSelection={selection}
          onCart={save}
          onBuy={buy}
          onCoupons={async (codes) => {
            const result = await shopApi<Cart>(
              "/store-api/checkout/coupons",
              { codes, revision: cart?.revision },
              cart?.token,
              "PUT",
            );
            save(result);
          }}
        />
      )}
    </div>
  );
}
