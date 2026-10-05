/** Shopper account overlay uses its own scoped session; merchant credentials never authenticate a customer. */
import { useCallback } from "react";
import { AppSurfaceSlot } from "../../shared/apps/AppSurfaces";
import AddressBook from "../../shared/customer/AddressBook";
import type { Contact } from "../../shared/customer/customer-types";
import CustomerFields from "../../shared/customer/CustomerFields";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import "../../shared/styles/customers.css";
import CustomerSignIn from "./CustomerSignIn";

import { useEffect, useRef, useState } from "react";
import { downloadFile } from "../../shared/api/download";
import { shopApi, type Cart, type Order } from "../../shared/api/shop-api";
import { useOperationsText } from "../../shared/i18n/operations-i18n";
import { useShopText } from "../../shared/i18n/shop-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
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
  const { o, locale } = useOperationsText();
  const [downloads, setDownloads] = useState<any[]>([]);
  const key = `rac-customer:${new URLSearchParams(location.search).get("shop") ?? "atelier"}`;
  const [signed, setSigned] = useState(!!localStorage.getItem(key));
  const [register, setRegister] = useState(false);
  const { c } = useCustomerText();
  const [options, setOptions] = useState<{
    countries: string[];
    payments: any[];
  }>();
  const request = useCallback(
    async (path: string, body?: unknown, method?: string) =>
      shopApi<any>(path, body, undefined, method),
    [],
  );
  const [profile, setProfile] = useState<{
    email: string;
    profile: Contact;
    customerNumber: string;
    revision: number;
  }>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setProfile(await shopApi("/store-api/account/profile"));
    setOptions(
      await shopApi("/store-api/checkout/options", undefined, cart?.token),
    );
    setDownloads((await shopApi<any>("/store-api/account/downloads")).elements);
    setOrders(
      (await shopApi<{ elements: Order[] }>("/store-api/account/orders"))
        .elements,
    );
  };
  useEffect(() => {
    if (signed)
      void load().catch((e) => {
        setError(e.message);
        if (e.status === 401) {
          localStorage.removeItem(key);
          setSigned(false);
        }
      });
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
        <AppSurfaceSlot location="account.overview" />
        <header>
          <h2>{w("account")}</h2>
          <button className="shop-secondary" onClick={onClose}>
            {s("close")}
          </button>
        </header>
        {!signed ? (
          <CustomerSignIn
            run={run}
            register={register}
            cart={cart}
            sessionKey={key}
            onCart={onCart}
            setSigned={setSigned}
            w={w}
            c={c}
            s={s}
            busy={busy}
            setRegister={setRegister}
          />
        ) : (
          <>
            <p>
              {profile?.email} · {c("customerNumber")}:{" "}
              {profile?.customerNumber}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await shopApi(
                    "/store-api/account/profile",
                    {
                      ...profile?.profile,
                      address: null,
                    },
                    undefined,
                    "PUT",
                  );
                  await load();
                });
              }}
            >
              <h3>{w("customerData")}</h3>
              {profile && (
                <CustomerFields
                  value={profile.profile}
                  onChange={(p) => setProfile({ ...profile, profile: p })}
                  disabled={busy}
                />
              )}
              <label>
                {c("preferredPayment")}
                <select
                  value={profile?.profile.defaultPaymentMethodId ?? ""}
                  onChange={(e) =>
                    setProfile((p) =>
                      p
                        ? {
                            ...p,
                            profile: {
                              ...p.profile,
                              defaultPaymentMethodId: e.target.value || null,
                            },
                          }
                        : p,
                    )
                  }
                >
                  <option value="">{c("noPreference")}</option>
                  {options?.payments.map((v) => (
                    <option key={v.id} value={v.id}>
                      {s(v.name)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="shop-primary" disabled={busy}>
                {w("saveProfile")}
              </button>
            </form>
            <AddressBook
              request={request}
              path="/store-api/account/addresses"
              countries={options?.countries ?? ["DE", "FR", "ES"]}
              onChange={() => void load()}
            />
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
            <h3>{o("assets")}</h3>
            <p>{o("downloadHint")}</p>
            {downloads.map((d) => (
              <button
                className="shop-secondary"
                key={d.orderId + d.id}
                onClick={() =>
                  void run(() =>
                    downloadFile(
                      `/store-api/orders/${d.orderId}/downloads/${d.id}`,
                      {
                        "x-tenant":
                          new URLSearchParams(location.search).get("shop") ??
                          "atelier",
                        "x-customer-token": localStorage.getItem(key) ?? "",
                      },
                    ),
                  )
                }
              >
                {d.name ?? d.title[locale.slice(0, 2)] ?? d.title.en} ·{" "}
                {d.filename}
              </button>
            ))}
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
