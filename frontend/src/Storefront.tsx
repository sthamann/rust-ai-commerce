import { useEffect, useState } from "react";
import { locales, type Locale } from "./i18n";
import { useShopText } from "./shop-i18n";
import {
  shopApi,
  type Product,
  type Cart,
  type Order,
  type Selection,
} from "./shop-api";
import Art from "./ProductArt";
import Icon from "./Icon";
import ProductPage from "./ProductPage";
import CheckoutPanel from "./CheckoutPanel";
import "./shop.css";
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
  const { s, money, locale, setLocale } = useShopText();
  const shopTenant =
    new URLSearchParams(location.search).get("shop") ?? "atelier";
  const cartKey = `rac-cart:${shopTenant}`;
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Cart>();
  const [id, setId] = useState(productId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bag, setBag] = useState(false);
  const [order, setOrder] = useState<Order>();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [wish, setWish] = useState("");
  const [advice, setAdvice] = useState<{
    explanation: string;
    recommended_ids: string[];
  }>();
  const [viewed, setViewed] = useState<Record<string, number>>({});
  const [experience, setExperience] = useState<{
    variant: string;
    headline?: string;
  }>();
  const save = (c: Cart) => {
    setCart(c);
    localStorage.setItem(cartKey, c.token);
  };
  const catalog = async (token?: string) =>
    setProducts(
      (await shopApi<{ elements: Product[] }>("/store-api/product", {}, token))
        .elements,
    );
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
        try {
          c = await shopApi<Cart>(
            "/store-api/checkout/cart",
            token ? undefined : { session },
            token ?? undefined,
          );
          if (c.status !== "open")
            c = await shopApi<Cart>("/store-api/checkout/cart", { session });
        } catch {
          c = await shopApi<Cart>("/store-api/checkout/cart", { session });
        }
        if (!active) return;
        save(c);
        await catalog(c.token);
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
    await catalog(cart.token);
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
        },
      });
      const o = await r.json();
      if (!r.ok) throw new Error(o.errors?.[0]?.detail ?? "Order failed");
      setOrder(o);
      const next = await shopApi<Cart>("/store-api/checkout/cart", { session });
      save(next);
      await catalog(next.token);
    });
  const affinity = Object.entries(viewed).sort((a, b) => b[1] - a[1])[0];
  const adapted = !!affinity && affinity[1] >= 3;
  const list = products
    .filter(
      (p) =>
        (category === "all" || p.category === category) &&
        `${p.name} ${p.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      adapted
        ? Number(b.category === affinity[0]) -
          Number(a.category === affinity[0])
        : 0,
    );
  return (
    <div className="shop">
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
                await catalog(c.token);
              })
            }
          >
            {cart?.customerGroup === "business"
              ? "Example Studio · B2B"
              : s("business")}
          </button>
          <button onClick={onMerchant}>{s("studio")} ↗</button>
        </nav>
        <select
          aria-label="Language"
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          {Object.entries(locales).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
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
      {id ? (
        <ProductPage id={id} cart={cart} busy={busy} onAdd={add} />
      ) : (
        <main className="shop-content">
          <section className="shop-hero">
            <div>
              <p className="shop-kicker">ATELIER / CONSIDERED OBJECTS</p>
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
              <span>01 / FORM CHAIR · OAK & LINEN</span>
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
                <p className="shop-kicker">ATELIER / COLLECTION</p>
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
          </section>
        </main>
      )}
      <footer className="shop-footer">
        <strong>atelier /</strong>
        <p>{s("simulation")}</p>
        <a href="https://github.com/sthamann/rust-ai-commerce">GitHub ↗</a>
      </footer>
      {bag && (
        <CheckoutPanel
          cart={cart}
          order={order}
          busy={busy}
          onClose={() => setBag(false)}
          onQuantity={quantity}
          onSelection={selection}
          onBuy={buy}
        />
      )}
    </div>
  );
}
