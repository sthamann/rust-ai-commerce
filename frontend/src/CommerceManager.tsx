import { useCallback, useEffect, useState } from "react";
import { useShopText } from "./shop-i18n";
import { shopApi, type Config, type Order, type Review } from "./shop-api";
import Icon from "./Icon";
import "./commerce-manager.css";
type Data = {
  data: Config;
  revision: number;
  reviews: Review[];
  orders: Order[];
};
export default function CommerceManager({ token }: { token: string }) {
  const { s, money, locale } = useShopText();
  const [data, setData] = useState<Data>();
  const [config, setConfig] = useState<Config>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{
    order: Order;
    kind: string;
    state: string;
  }>();
  const load = useCallback(async () => {
    const v = await shopApi<Data>(
      "/api/merchant/commerce",
      undefined,
      undefined,
      undefined,
      token,
    );
    setData(v);
    setConfig(structuredClone(v.data));
  }, [token, locale]);
  useEffect(() => {
    let active = true;
    shopApi<Data>(
      "/api/merchant/commerce",
      undefined,
      undefined,
      undefined,
      token,
    )
      .then((v) => {
        if (active) {
          setData(v);
          setConfig(structuredClone(v.data));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token, locale]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const dirty = JSON.stringify(config) !== JSON.stringify(data?.data);
  return (
    <section className="commerce-manager">
      <div className="commerce-title">
        <div>
          <p className="kicker">ATELIER / COMMERCE</p>
          <h1>{s("commerce")}</h1>
          <p>{s("commerceHint")}</p>
        </div>
        <button
          className="studio-secondary"
          disabled={busy || dirty}
          onClick={() => run(load)}
        >
          <Icon name="refresh" size={16} />
          {s("reload")}
        </button>
      </div>
      {error && (
        <p role="alert" className="commerce-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="commerce-success">
          {notice}
        </p>
      )}
      {!config || !data ? (
        <p role="status">{s("loading")}</p>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await shopApi(
                  "/api/merchant/commerce",
                  { revision: data.revision, data: config },
                  undefined,
                  "PUT",
                  token,
                );
                await load();
                setNotice(s("saved"));
              });
            }}
          >
            <section className="commerce-card">
              <div className="commerce-section-heading">
                <Icon name="pulse" />
                <h2>{s("taxes")}</h2>
              </div>
              <div className="commerce-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{s("country")}</th>
                      {config.taxes.map((t) => (
                        <th key={t.id}>
                          {s(
                            t.id === "standard" ? "standardTax" : "reducedTax",
                          )}{" "}
                          %
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {config.countries.map((c) => (
                      <tr key={c}>
                        <th>{s(c)}</th>
                        {config.taxes.map((t, i) => (
                          <td key={t.id}>
                            <input
                              aria-label={`${s(c)} ${t.id}`}
                              type="number"
                              min="0"
                              max="50"
                              step=".1"
                              required
                              value={t.rates[c]}
                              onChange={(e) =>
                                setConfig({
                                  ...config,
                                  taxes: config.taxes.map((t, j) =>
                                    i === j
                                      ? {
                                          ...t,
                                          rates: {
                                            ...t.rates,
                                            [c]: Number(e.target.value),
                                          },
                                        }
                                      : t,
                                  ),
                                })
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="commerce-card">
              <div className="commerce-section-heading">
                <Icon name="box" />
                <h2>{s("shipping")}</h2>
              </div>
              <div className="shipping-methods">
                {config.shipping.map((method, i) => {
                  const update = (patch: Partial<typeof method>) =>
                    setConfig({
                      ...config,
                      shipping: config.shipping.map((v, j) =>
                        j === i ? { ...v, ...patch } : v,
                      ),
                    });
                  return (
                    <fieldset key={method.id}>
                      <legend>{s(method.name)}</legend>
                      <label className="commerce-check">
                        <input
                          type="checkbox"
                          checked={method.active}
                          onChange={(e) => update({ active: e.target.checked })}
                        />
                        {s("active")}
                      </label>
                      <label>
                        {s("fee")}
                        <input
                          type="number"
                          min="0"
                          max="1000"
                          step=".01"
                          required
                          value={method.price}
                          onChange={(e) =>
                            update({ price: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label>
                        {s("freeAbove")}
                        <input
                          type="number"
                          min="0"
                          max="100000"
                          step=".01"
                          value={method.freeAbove ?? ""}
                          onChange={(e) =>
                            update({
                              freeAbove:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <div className="commerce-day-fields">
                        <label>
                          {s("from")} · {s("days")}
                          <input
                            type="number"
                            min="0"
                            max="365"
                            required
                            value={method.minDays}
                            onChange={(e) =>
                              update({ minDays: Number(e.target.value) })
                            }
                          />
                        </label>
                        <label>
                          {s("max")} · {s("days")}
                          <input
                            type="number"
                            min={method.minDays}
                            max="365"
                            required
                            value={method.maxDays}
                            onChange={(e) =>
                              update({ maxDays: Number(e.target.value) })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        {s("taxType")}
                        <select
                          value={method.taxType}
                          onChange={(e) => update({ taxType: e.target.value })}
                        >
                          <option value="highest">{s("highest")}</option>
                          <option value="proportional">
                            {s("proportional")}
                          </option>
                        </select>
                      </label>
                      <div className="commerce-countries">
                        {config.countries.map((c) => (
                          <label className="commerce-check" key={c}>
                            <input
                              type="checkbox"
                              checked={method.countries.includes(c)}
                              onChange={(e) =>
                                update({
                                  countries: e.target.checked
                                    ? [...method.countries, c]
                                    : method.countries.filter((v) => v !== c),
                                })
                              }
                            />
                            {s(c)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            </section>
            <section className="commerce-card">
              <div className="commerce-section-heading">
                <Icon name="lock" />
                <h2>{s("payment")}</h2>
              </div>
              <p>{s("paymentHint")}</p>
              <div className="payment-methods">
                {config.payments.map((p, i) => (
                  <label key={p.id} className="commerce-check">
                    <input
                      type="checkbox"
                      checked={p.active}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          payments: config.payments.map((p, j) =>
                            i === j ? { ...p, active: e.target.checked } : p,
                          ),
                        })
                      }
                    />
                    <span>
                      <strong>{s(p.name)}</strong>
                      <small>{p.businessOnly ? "B2B" : "B2C + B2B"}</small>
                    </span>
                  </label>
                ))}
              </div>
            </section>
            <div className="commerce-save">
              <button className="studio-primary" disabled={busy || !dirty}>
                {s("save")}
              </button>
              <span>Revision {data.revision}</span>
            </div>
          </form>
          <section className="commerce-card">
            <div className="commerce-section-heading">
              <Icon name="chat" />
              <h2>{s("moderation")}</h2>
            </div>
            <p>{s("reviewHint")}</p>
            {data.reviews.map((r) => (
              <article className="commerce-review" key={r.id}>
                <div>
                  <strong>{r.title}</strong>
                  <small>
                    {r.author} · {r.rating}/5 · {r.productId}
                    {r.demo ? ` · ${s("demoReview")}` : ""}
                    {r.verifiedPurchase ? ` · ${s("verified")}` : ""}
                  </small>
                  <p>{r.content}</p>
                </div>
                <button
                  className="studio-secondary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await shopApi(
                        `/api/merchant/reviews/${r.id}`,
                        { approved: !r.approved },
                        undefined,
                        "PUT",
                        token,
                      );
                      await load();
                    })
                  }
                >
                  {s(r.approved ? "hide" : "approve")}
                </button>
              </article>
            ))}
          </section>
          <section className="commerce-card">
            <div className="commerce-section-heading">
              <Icon name="box" />
              <h2>{s("orders")}</h2>
            </div>
            {data.orders.map((o) => (
              <article className="commerce-order" key={o.id}>
                <div className="commerce-order-heading">
                  <strong>{o.orderNumber}</strong>
                  <span>{money(o.cart.price.totalPrice)}</span>
                </div>
                <div className="commerce-order-state">
                  <span>
                    {s(o.payment.method?.name ?? "card")} ·{" "}
                    {s(
                      o.payment.state === "pending"
                        ? "pending-payment"
                        : o.payment.state,
                    )}
                  </span>
                  <span>
                    {s(o.deliveries?.[0]?.shippingMethod.name ?? "unknown")} ·{" "}
                    {s(o.deliveries?.[0]?.state ?? "unknown")}
                  </span>
                </div>
                {o.deliveries?.[0] && (
                  <small>
                    {o.deliveries[0].deliveryDate.earliest} —{" "}
                    {o.deliveries[0].deliveryDate.latest}
                    {o.deliveries[0].trackingCode
                      ? ` · ${o.deliveries[0].trackingCode}`
                      : ""}
                  </small>
                )}
                <div className="commerce-order-actions">
                  {o.payment.provider !== "paypal" &&
                    ["pending", "authorized"].includes(o.payment.state) && (
                      <button
                        className="studio-secondary"
                        disabled={busy}
                        onClick={() =>
                          setConfirm({
                            order: o,
                            kind: "payment",
                            state: "paid",
                          })
                        }
                      >
                        {s("markPaid")}
                      </button>
                    )}
                  {o.deliveries?.[0]?.state === "open" && (
                    <>
                      <input
                        aria-label={`${s("tracking")} ${o.orderNumber}`}
                        placeholder={s("tracking")}
                        maxLength={100}
                        value={tracking[o.id] ?? ""}
                        onChange={(e) =>
                          setTracking({ ...tracking, [o.id]: e.target.value })
                        }
                      />
                      <button
                        className="studio-secondary"
                        disabled={busy}
                        onClick={() =>
                          setConfirm({
                            order: o,
                            kind: "delivery",
                            state: "shipped",
                          })
                        }
                      >
                        {s("ship")}
                      </button>
                    </>
                  )}
                  {o.deliveries?.[0]?.state === "shipped" && (
                    <button
                      className="studio-secondary"
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          order: o,
                          kind: "delivery",
                          state: "delivered",
                        })
                      }
                    >
                      {s("complete")}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
        </>
      )}
      {confirm && (
        <div
          className="commerce-confirm"
          role="alertdialog"
          aria-labelledby="commerce-confirm-title"
        >
          <h3 id="commerce-confirm-title">
            {confirm.order.orderNumber} · {s(confirm.state)}
          </h3>
          <p>{s(confirm.kind === "payment" ? "paymentHint" : "simulation")}</p>
          <button
            className="studio-secondary"
            onClick={() => setConfirm(undefined)}
          >
            {s("cancel")}
          </button>
          <button
            className="studio-primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await shopApi(
                  `/api/merchant/orders/${confirm.order.id}/transition`,
                  {
                    revision: confirm.order.revision ?? 1,
                    kind: confirm.kind,
                    state: confirm.state,
                    trackingCode: tracking[confirm.order.id],
                  },
                  undefined,
                  "POST",
                  token,
                );
                setConfirm(undefined);
                await load();
              })
            }
          >
            {s("confirm")}
          </button>
        </div>
      )}
    </section>
  );
}
