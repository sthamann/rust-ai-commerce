import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import Merchant from "./Merchant";
import Art from "./ProductArt";
import { LocaleProvider, useLocale, getLocale } from "./i18n";
type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  revision: number;
  tax_rate: number;
  list_price?: number;
};
type Cart = {
  token: string;
  id: string;
  revision: number;
  status: string;
  company?: string;
  customerGroup: string;
  lineItems: {
    id: string;
    label: string;
    quantity: number;
    price: { unitPrice: number; totalPrice: number };
  }[];
  price: {
    totalPrice: number;
    netPrice: number;
    tax: number;
    taxStatus: string;
  };
  order?: Order;
};
type Order = {
  id: string;
  orderNumber: string;
  state: string;
  payment: { provider: string };
};
type Experience = {
  variant: string;
  headline: string;
  revision: number;
  blocks: { type: string }[];
  propensity: number;
};
const session = localStorage.getItem("rac-session") || crypto.randomUUID();
localStorage.setItem("rac-session", session);
const money = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    n,
  );
async function api(
  path: string,
  body?: unknown,
  extra: Record<string, string> = {},
  method?: string,
) {
  const response = await fetch(path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      "x-commerce-locale": getLocale(),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const v = await response.json();
  if (!response.ok) throw new Error(v.errors?.[0]?.detail || "Request failed");
  return v;
}
function App() {
  const { locale, t } = useLocale();
  const [products, setProducts] = useState<Product[]>([]),
    [cart, setCart] = useState<Cart>(),
    [exp, setExp] = useState<Experience>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [order, setOrder] = useState<Order>(),
    [category, setCategory] = useState("all"),
    [query, setQuery] = useState(""),
    [viewed, setViewed] = useState<Record<string, number>>({}),
    [showCart, setShowCart] = useState(false),
    [business, setBusiness] = useState(false),
    [admin, setAdmin] = useState(location.hash === "#merchant");
  const [wish, setWish] = useState(""),
    [advice, setAdvice] = useState<{
      explanation: string;
      recommended_ids: string[];
      layout: string;
    }>();
  const headers = (): Record<string, string> =>
    cart ? { "sw-context-token": cart.token } : {};
  const refreshProducts = async () =>
    setProducts((await api("/store-api/product", {})).elements);
  useEffect(() => {
    (async () => {
      try {
        await refreshProducts();
        setExp(await api("/api/experience", { session }));
        const token = localStorage.getItem("rac-cart");
        let c: Cart;
        try {
          c = token
            ? await api("/store-api/checkout/cart", undefined, {
                "sw-context-token": token,
              })
            : await api("/store-api/checkout/cart", { session });
          if (c.status !== "open")
            c = await api("/store-api/checkout/cart", { session });
        } catch {
          c = await api("/store-api/checkout/cart", { session });
        }
        setCart(c);
        setBusiness(c.customerGroup === "business");
        localStorage.setItem("rac-cart", c.token);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [locale]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const saveCart = (c: Cart) => {
    setCart(c);
    setBusiness(c.customerGroup === "business");
    localStorage.setItem("rac-cart", c.token);
  };
  const add = (id: string) =>
    run(async () => {
      saveCart(
        await api(
          "/store-api/checkout/cart/line-item",
          { items: [{ referencedId: id, quantity: 1 }] },
          headers(),
        ),
      );
      setShowCart(true);
    });
  const quantity = (id: string, q: number) =>
    run(async () => {
      if (!cart) return;
      const items = cart.lineItems
        .map((i) => ({ id: i.id, quantity: i.id === id ? q : i.quantity }))
        .filter((i) => i.quantity > 0);
      saveCart(
        await api(
          "/store-api/checkout/cart",
          { items, revision: cart.revision },
          headers(),
          "PUT",
        ),
      );
    });
  const buy = () =>
    run(async () => {
      if (!cart) return;
      const key = `browser-${cart.id}`;
      setOrder(
        await api(
          "/store-api/checkout/order",
          {},
          { ...headers(), "Idempotency-Key": key },
        ),
      );
      await refreshProducts();
      saveCart(await api("/store-api/checkout/cart", { session }));
    });
  const b2b = () =>
    run(async () => {
      saveCart(
        await api(
          "/store-api/account/login",
          { email: "buyer@example.test", password: "demo-business" },
          headers(),
        ),
      );
      setBusiness(true);
    });
  const interaction = (p: Product) =>
    setViewed((old) => ({ ...old, [p.category]: (old[p.category] || 0) + 1 }));
  const affinity = Object.entries(viewed).sort((a, b) => b[1] - a[1])[0];
  const adapted = !!affinity && affinity[1] >= 3;
  // Stable keyed components: behavior changes ranking, never creates executable code.
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
  const comparison =
    advice?.layout === "comparison" ||
    exp?.blocks.some((b) => b.type === "comparison-grid") ||
    query.length > 3;
  if (admin)
    return (
      <Merchant
        onExit={() => {
          setAdmin(false);
          location.hash = "";
        }}
        onChanged={async () => {
          await refreshProducts();
          setExp(await api("/api/experience", { session }));
        }}
      />
    );
  return (
    <>
      <header className="nav">
        <a className="brand" href="#" onClick={() => setAdmin(false)}>
          atelier<span> / </span>
        </a>
        <nav>
          <button
            onClick={() => {
              setAdmin(false);
              setCategory("all");
            }}
          >
            Collection
          </button>
          <button
            onClick={() =>
              run(async () => {
                if (business) return;
                await b2b();
              })
            }
          >
            {business ? "Example Studio · B2B" : "Business account"}
          </button>
          <button
            onClick={() => {
              setAdmin(!admin);
              location.hash = admin ? "" : "merchant";
            }}
          >
            Merchant agent ↗
          </button>
        </nav>
        <button className="bag" onClick={() => setShowCart(!showCart)}>
          Bag <b>{cart?.lineItems.reduce((n, i) => n + i.quantity, 0) || 0}</b>
        </button>
      </header>
      {error && (
        <div role="alert" className="error">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
      {admin ? (
        <Merchant
          onExit={() => {
            setAdmin(false);
            location.hash = "";
          }}
          onChanged={async () => {
            await refreshProducts();
            setExp(await api("/api/experience", { session }));
          }}
        />
      ) : (
        <main>
          <section className="hero">
            <div>
              <div className="eyebrow">
                CONSIDERED OBJECTS · OPEN COMMERCE EXPERIMENT
              </div>
              <h1>
                {exp?.headline || "Objects for a more considered everyday."}
              </h1>
              <p>
                A quiet collection. A living experience.
                <br />
                Designed around what matters to you.
              </p>
              <a className="primary" href="#collection">
                Explore the collection <span>↗</span>
              </a>
            </div>
            <div className="hero-art">
              <span className="art-label">FORM / FUNCTION / EVERYDAY</span>
              <Art id="chair" />
              <div className="art-caption">
                01 — The Form Chair <span>Oak & natural linen</span>
              </div>
            </div>
          </section>
          <section className="concierge">
            <div>
              <div className="eyebrow">
                ASK ATELIER · CONNECTED SHOP KNOWLEDGE
              </div>
              <p>Describe your space. We’ll find the objects that fit.</p>
            </div>
            <div className="wish">
              <input
                aria-label="Ask Atelier"
                value={wish}
                onChange={(e) => setWish(e.target.value)}
                placeholder="A warm, compact reading corner under €300…"
              />
              <button
                disabled={busy || !wish}
                onClick={() =>
                  run(async () => {
                    setAdvice(
                      (
                        await api(
                          "/api/concierge",
                          { request: wish },
                          headers(),
                        )
                      ).answer,
                    );
                    setQuery("");
                    setCategory("all");
                  })
                }
              >
                {busy ? "Thinking…" : "Ask ↗"}
              </button>
            </div>
            {advice && (
              <div className="advice" role="status">
                <p>{advice.explanation}</p>
                <div>
                  {advice.recommended_ids.map((id) => (
                    <button key={id} onClick={() => add(id)}>
                      {products.find((p) => p.id === id)?.name} +
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
          <section className="collection" id="collection">
            <div className="section-heading">
              <div>
                <div className="eyebrow">THE COLLECTION</div>
                <h2>
                  {adapted
                    ? `A closer look at ${affinity[0]}.`
                    : "Make room for the everyday."}
                </h2>
              </div>
              <span className="adaptation" aria-live="polite">
                {adapted
                  ? "● Adapted to your browsing"
                  : `● ${exp?.variant || "discovery"} experience`}
              </span>
            </div>
            <div className="filters">
              <div>
                {["all", "furniture", "lighting", "objects"].map((c) => (
                  <button
                    key={c}
                    className={category === c ? "active" : ""}
                    onClick={() => setCategory(c)}
                  >
                    {c === "all" ? "All objects" : c}
                  </button>
                ))}
              </div>
              <input
                aria-label="Search collection"
                placeholder="Find something considered…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className={`grid ${comparison ? "compare" : ""}`}>
              {list.map((p) => (
                <article
                  className="product"
                  key={p.id}
                  onMouseEnter={() => interaction(p)}
                  onFocus={() => interaction(p)}
                >
                  <div className={`product-art art-${p.category}`}>
                    <Art id={p.id} />
                    <span className="stock">
                      {p.stock > 0 ? `${p.stock} available` : "Sold out"}
                    </span>
                  </div>
                  <div className="product-info">
                    <div>
                      <span className="eyebrow">{p.category}</span>
                      <h3>{p.name}</h3>
                      <p>{p.description}</p>
                    </div>
                    <strong>
                      {money(
                        business
                          ? (p.price / (1 + p.tax_rate / 100)) * 0.9
                          : p.price,
                      )}
                    </strong>
                  </div>
                  <button
                    disabled={busy || p.stock <= 0}
                    onClick={() => add(p.id)}
                    className="add"
                  >
                    Add to bag <span>+</span>
                  </button>
                  {comparison && (
                    <div className="spec">
                      EUR ·{" "}
                      {business
                        ? "net group price, quantity tiers at checkout"
                        : "incl. tax"}{" "}
                      · stock {p.stock}
                    </div>
                  )}
                </article>
              ))}
            </div>
            {list.length === 0 && <p>No matching objects.</p>}
          </section>
          <section className="footnote">
            <span>RUST CORE / APACHE AGE / OPEN COMMERCE</span>
            <p>
              This is a real working prototype. Checkout uses simulated payment.
              <br />
              Behavior adapts the collection; server policy learns from
              simulated orders.
            </p>
          </section>
        </main>
      )}
      {showCart && (
        <>
          <div className="shade" onClick={() => setShowCart(false)} />
          <aside className="cart" aria-label="Shopping bag">
            <div className="cart-title">
              <h2>Your bag.</h2>
              <button onClick={() => setShowCart(false)}>×</button>
            </div>
            {order && (
              <div className="success" role="status">
                <b>Order placed: {order.orderNumber}</b>
                <p>Saved in PostgreSQL · simulated payment</p>
              </div>
            )}
            {cart?.lineItems.length === 0 ? (
              <p>A little space for something good.</p>
            ) : (
              cart?.lineItems.map((i) => (
                <div className="cart-item" key={i.id}>
                  <div>
                    <h3>{i.label}</h3>
                    <p>
                      {money(i.price.unitPrice)} {business ? "net" : ""}
                    </p>
                  </div>
                  <div className="stepper">
                    <button
                      aria-label={`Decrease ${i.label}`}
                      disabled={busy}
                      onClick={() => quantity(i.id, i.quantity - 1)}
                    >
                      −
                    </button>
                    <span>{i.quantity}</span>
                    <button
                      aria-label={`Increase ${i.label}`}
                      disabled={busy}
                      onClick={() => quantity(i.id, i.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))
            )}
            <div className="cart-total">
              <p>
                <span>Tax</span>
                <b>{money(cart?.price.tax || 0)}</b>
              </p>
              <p>
                <span>Total incl. tax</span>
                <b>{money(cart?.price.totalPrice || 0)}</b>
              </p>
              {business && (
                <p>
                  Example Studio · 10% group discount / 15% from 5 units.
                  <br />
                  Wasm purchase limit: €1,000.
                </p>
              )}
              <button
                className="primary"
                disabled={busy || !cart?.lineItems.length}
                onClick={buy}
              >
                {busy ? "Processing…" : "Place demo order ↗"}
              </button>
              <small>No real payment. Inventory and order are durable.</small>
            </div>
          </aside>
        </>
      )}
      <footer>
        <span>atelier /</span>
        <span>Experimental, open, inspectable.</span>
        <a href="https://github.com/sthamann/rust-ai-commerce">Source ↗</a>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <LocaleProvider>
    <App />
  </LocaleProvider>,
);
