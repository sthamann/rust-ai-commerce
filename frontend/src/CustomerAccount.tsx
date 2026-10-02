/** Shopper account overlay uses its own scoped session; merchant credentials never authenticate a customer. */
import { useEffect, useState, useRef } from "react";
import { shopApi, type Cart, type Order } from "./shop-api";
import { useShopText } from "./shop-i18n";
import { useWorkbenchText } from "./workbench-i18n";
export default function CustomerAccount({
  cart,
  onCart,
  onClose,
}: {
  cart?: Cart;
  onCart: (c: Cart) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const { s, money } = useShopText();
  const { w } = useWorkbenchText();
  const key = `rac-customer:${new URLSearchParams(location.search).get("shop") ?? "atelier"}`;
  const [signed, setSigned] = useState(!!localStorage.getItem(key));
  const [register, setRegister] = useState(false);
  const [profile, setProfile] = useState<{
    email: string;
    profile: { name?: string; address?: Cart["checkout"]["address"] };
  }>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setProfile(await shopApi("/store-api/account/profile"));
    setOrders(
      (await shopApi<{ elements: Order[] }>("/store-api/account/orders"))
        .elements,
    );
  };
  useEffect(() => {
    if (signed) void load().catch((e) => setError(e.message));
  }, [signed]);
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
  return (
    <dialog
      ref={ref}
      className="shop-bag"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <section
        className="bag-body"
        role="dialog"
        aria-modal="true"
        aria-label={w("account")}
      >
        <header>
          <h2>{w("account")}</h2>
          <button className="shop-secondary" onClick={onClose}>
            {s("close")}
          </button>
        </header>
        {!signed ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const email = String(f.get("email")),
                  password = String(f.get("password"));
                if (register)
                  await shopApi("/store-api/account/register", {
                    name: f.get("name"),
                    email,
                    password,
                  });
                const result = await shopApi<Cart & { customerToken: string }>(
                  "/store-api/account/login",
                  { email, password },
                  cart?.token,
                );
                localStorage.setItem(key, result.customerToken);
                onCart(result);
                setSigned(true);
              });
            }}
          >
            <h3>{w(register ? "customerRegister" : "customerLogin")}</h3>
            {register && (
              <label>
                {s("accountName")}
                <input name="name" required maxLength={100} />
              </label>
            )}
            <label>
              {s("email")}
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              {s("password")}
              <input
                name="password"
                type="password"
                required
                minLength={register ? 12 : 1}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
              />
            </label>
            <button className="shop-primary" disabled={busy || !cart}>
              {w(register ? "customerRegister" : "customerLogin")}
            </button>
            <button
              className="shop-secondary"
              type="button"
              onClick={() => setRegister(!register)}
            >
              {w(register ? "customerLogin" : "customerRegister")}
            </button>
          </form>
        ) : (
          <>
            <p>{profile?.email}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await shopApi(
                    "/store-api/account/profile",
                    {
                      name: profile?.profile.name,
                      address: profile?.profile.address ?? null,
                    },
                    undefined,
                    "PUT",
                  );
                  await load();
                });
              }}
            >
              <h3>{w("customerData")}</h3>
              <label>
                {s("accountName")}
                <input
                  value={profile?.profile.name ?? ""}
                  required
                  onChange={(e) =>
                    setProfile((p) =>
                      p
                        ? {
                            ...p,
                            profile: { ...p.profile, name: e.target.value },
                          }
                        : p,
                    )
                  }
                />
              </label>
              {(["name", "street", "postalCode", "city"] as const).map(
                (field) => (
                  <label key={field}>
                    {w(field === "name" ? "addressName" : field)}
                    <input
                      value={profile?.profile.address?.[field] ?? ""}
                      onChange={(e) =>
                        setProfile((p) =>
                          p
                            ? {
                                ...p,
                                profile: {
                                  ...p.profile,
                                  address: {
                                    name: "",
                                    street: "",
                                    postalCode: "",
                                    city: "",
                                    ...p.profile.address,
                                    [field]: e.target.value,
                                  },
                                },
                              }
                            : p,
                        )
                      }
                    />
                  </label>
                ),
              )}
              <button className="shop-primary" disabled={busy}>
                {w("saveProfile")}
              </button>
            </form>
            <details>
              <summary>{w("changePassword")}</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    const v = await shopApi<{ customerToken: string }>(
                      "/store-api/account/password",
                      {
                        oldPassword: f.get("oldPassword"),
                        newPassword: f.get("newPassword"),
                      },
                    );
                    localStorage.setItem(key, v.customerToken);
                  });
                }}
              >
                <label>
                  {w("currentPassword")}
                  <input
                    name="oldPassword"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                </label>
                <label>
                  {w("newPassword")}
                  <input
                    name="newPassword"
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </label>
                <button className="shop-primary" disabled={busy}>
                  {w("changePassword")}
                </button>
              </form>
            </details>
            <h3>{w("customerOrders")}</h3>
            {!orders.length && <p>{w("noOrders")}</p>}
            {orders.map((o) => (
              <article key={o.id}>
                <strong>
                  {o.orderNumber} · {money(o.cart.price.totalPrice)}
                </strong>
                <p>
                  {o.cart.lineItems
                    .map((i) => `${i.quantity} × ${i.label}`)
                    .join(", ")}
                </p>
                <small>
                  {s(o.state)} ·{" "}
                  {s(
                    o.payment.state === "pending"
                      ? "pending-payment"
                      : o.payment.state,
                  )}
                </small>
              </article>
            ))}
            <button
              className="shop-secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await shopApi("/store-api/account/logout", {}, cart?.token);
                  localStorage.removeItem(key);
                  setSigned(false);
                  setProfile(undefined);
                  setOrders([]);
                  onCart(await shopApi<Cart>("/store-api/checkout/cart", {}));
                })
              }
            >
              {s("logout")}
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </dialog>
  );
}
