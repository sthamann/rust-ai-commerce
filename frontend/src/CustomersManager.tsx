import AddressBook from "./AddressBook";
import CustomerFields from "./CustomerFields";
import { useCustomerText } from "./customer-i18n";
import "./customers.css";
/** CRM list and editable customer profile with linked order history. */
import { useState, useEffect, useCallback } from "react";
import type { RequestFn } from "./studio-types";
import { useOperationsText } from "./operations-i18n";
export default function CustomersManager({ request }: { request: RequestFn }) {
  const { o } = useOperationsText();
  const { c } = useCustomerText();
  const [countries, setCountries] = useState<string[]>(["DE"]);
  const [rows, setRows] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [cursor, setCursor] = useState<string>(),
    [customer, setCustomer] = useState<any>(),
    [canEdit, setCanEdit] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    async (after = "") => {
      const v = await request(
        `/api/merchant/customers?query=${encodeURIComponent(query)}&after=${encodeURIComponent(after)}`,
      );
      setRows((prev) => (after ? [...prev, ...v.elements] : v.elements));
      setCursor(v.nextCursor);
    },
    [request, query],
  );
  useEffect(() => {
    request("/store-api/checkout/options")
      .then((v) => setCountries(v.countries))
      .catch((e) => setError(e.message));
    void load().catch((e) => setError(e.message));
    request("/api/auth/access")
      .then((v) => setCanEdit(v.permissions.includes("customers.write")))
      .catch((e) => setError(e.message));
  }, [load, request]);
  const detail = async (email: string) => {
    try {
      setCustomer(
        await request(`/api/merchant/customers/${encodeURIComponent(email)}`),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="studio-page workbench operations">
      <div className="page-intro">
        <h1>{o("customers")}</h1>
        <p>{o("customersHint")}</p>
      </div>
      {error && <p role="alert">{error}</p>}
      {customer ? (
        <>
          <button
            className="studio-secondary"
            onClick={() => {
              setCustomer(undefined);
              void load();
            }}
          >
            {o("back")}
          </button>
          <section className="studio-card">
            <div className="customer-heading">
              <div>
                <small>
                  {c("customerNumber")} · {customer.customerNumber}
                </small>
                <h2>{customer.profile.name || customer.email}</h2>
                <p>{customer.email}</p>
              </div>
              <span className="operation-status">
                {o(customer.active ? "active" : "inactive")}
              </span>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await request(
                    `/api/merchant/customers/${encodeURIComponent(customer.email)}`,
                    {
                      revision: customer.revision,
                      profile: customer.profile,
                      company: customer.company || null,
                      customerGroup: customer.customerGroup,
                      active: customer.active,
                    },
                    "PUT",
                  );
                  await detail(customer.email);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <CustomerFields
                value={{ ...customer.profile, company: customer.company ?? "" }}
                disabled={!canEdit}
                onChange={(p) =>
                  setCustomer({ ...customer, profile: p, company: p.company })
                }
              />
              <label>
                {o("group")}
                <select
                  disabled={!canEdit}
                  value={customer.customerGroup}
                  onChange={(e) =>
                    setCustomer({ ...customer, customerGroup: e.target.value })
                  }
                >
                  {["consumer", "business"].map((g) => (
                    <option key={g} value={g}>
                      {o(g)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={customer.active}
                  onChange={(e) =>
                    setCustomer({ ...customer, active: e.target.checked })
                  }
                />
                {o("active")}
              </label>
              {canEdit && (
                <button disabled={busy} className="studio-primary">
                  {o("save")}
                </button>
              )}
            </form>
            <AddressBook
              request={request}
              path={`/api/merchant/customers/${encodeURIComponent(customer.email)}/addresses`}
              countries={countries}
              canEdit={canEdit}
              onChange={() => void detail(customer.email)}
            />
            {customer.orders && (
              <>
                <h3>{o("orders")}</h3>
                {customer.orders.map((r: any) => (
                  <div className="operation-row" key={r.id}>
                    <strong>{r.orderNumber}</strong>
                    <span>{o(r.state)}</span>
                    <span>{r.cart.price.totalPrice.toFixed(2)} €</span>
                  </div>
                ))}
              </>
            )}
          </section>
        </>
      ) : (
        <section className="studio-card">
          <label>
            {o("search")}
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {rows.map((c) => (
            <button
              className="operation-row"
              key={c.email}
              onClick={() => detail(c.email)}
            >
              <strong>{c.profile.name || c.email}</strong>
              <span>{c.email}</span>
              <span>{o(c.customerGroup)}</span>
            </button>
          ))}
          {!rows.length && <p>{o("empty")}</p>}
          {cursor && (
            <button className="studio-secondary" onClick={() => load(cursor)}>
              {o("more")}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
