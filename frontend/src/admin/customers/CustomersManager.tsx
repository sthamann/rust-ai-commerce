/** CRM list and editable customer profile with linked order history. */
import AddressBook from "../../shared/customer/AddressBook";
import CustomerFields from "../../shared/customer/CustomerFields";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import "../../shared/styles/customers.css";

import { useCallback, useEffect, useState } from "react";
import EntityHistory from "../../shared/history/EntityHistory";
import { useCrmText } from "../../shared/i18n/crm-i18n";
import ConfirmDialog from "../../shared/ui/ConfirmDialog";
import { inheritedText } from "../../shared/geography/geography-types";
import type { OpenEntity } from "../shell/useEntityNavigation";
import { useOperationsText } from "../../shared/i18n/operations-i18n";
import type { RequestFn } from "../shell/studio-types";
export default function CustomersManager({
  request,
  initialEmail,
  onEntity,
  onEntityBack,
}: {
  request: RequestFn;
  initialEmail?: string;
  onEntity?: OpenEntity;
  onEntityBack?: () => void;
}) {
  const { o } = useOperationsText();
  const { c } = useCustomerText();
  const { r, locale } = useCrmText();
  const [groups, setGroups] = useState<any[]>([]),
    [mainLocale, setMainLocale] = useState("en-GB"),
    [baseline, setBaseline] = useState(""),
    [pending, setPending] = useState<(() => void) | null>(null);
  const [countries, setCountries] = useState<string[]>(["DE"]);
  const [rows, setRows] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [cursor, setCursor] = useState<string>(),
    [customer, setCustomer] = useState<any>(),
    [canEdit, setCanEdit] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const dirty =
    !!customer &&
    JSON.stringify([
      customer.profile,
      customer.company,
      customer.customerGroup,
      customer.active,
    ]) !== baseline;
  const navigate = (action: () => void) => {
    if (dirty) setPending(() => action);
    else action();
  };
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
    request("/api/merchant/customer-groups")
      .then((v) => {
        setGroups(v.elements);
        setMainLocale(v.mainLocale);
      })
      .catch((e) => setError(e.message));
    request("/api/auth/access")
      .then((v) => setCanEdit(v.permissions.includes("customers.write")))
      .catch((e) => setError(e.message));
  }, [load, request]);
  const detail = async (email: string) => {
    try {
      const next = await request(
        `/api/merchant/customers/${encodeURIComponent(email)}`,
      );
      setCustomer(next);
      setBaseline(
        JSON.stringify([
          next.profile,
          next.company,
          next.customerGroup,
          next.active,
        ]),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    if (initialEmail) void detail(initialEmail);
    else setCustomer(undefined);
  }, [initialEmail]);
  const groupName = (id: string) =>
    inheritedText(
      groups.find((g) => g.id === id)?.translations ?? {},
      locale,
      mainLocale,
      "name",
    ) || id;
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
              navigate(() => {
                if (onEntityBack) onEntityBack();
                else {
                  setCustomer(undefined);
                  void load();
                }
              });
            }}
          >
            {onEntityBack ? r("back") : o("back")}
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
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {groupName(g.id)}
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
            {dirty && <p className="muted">{r("addressPending")}</p>}
            <AddressBook
              request={request}
              path={`/api/merchant/customers/${encodeURIComponent(customer.email)}/addresses`}
              countries={countries}
              canEdit={canEdit && !dirty && !busy}
              onChange={() => void detail(customer.email)}
            />
            {customer.orders && (
              <>
                <h3>{o("orders")}</h3>
                {customer.orders.map((r: any) => (
                  <button
                    type="button"
                    className="operation-row"
                    key={r.id}
                    onClick={() => navigate(() => onEntity?.("orders", r.id))}
                  >
                    <strong>{r.orderNumber}</strong>
                    <span>{o(r.state)}</span>
                    <span>
                      {new Intl.NumberFormat(locale, {
                        style: "currency",
                        currency: r.currency ?? "EUR",
                      }).format(r.cart.price.totalPrice)}
                    </span>
                  </button>
                ))}
              </>
            )}
            <EntityHistory
              request={request}
              entity="customer"
              id={customer.email}
              revision={customer.revision}
              dirty={dirty || busy}
              onRestored={() => detail(customer.email)}
            />
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
              onClick={() =>
                onEntity ? onEntity("customers", c.email) : void detail(c.email)
              }
            >
              <strong>{c.profile.name || c.email}</strong>
              <span>{c.email}</span>
              <span>{groupName(c.customerGroup)}</span>
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
      {pending && (
        <ConfirmDialog
          title={r("pending")}
          confirmLabel={r("discard")}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            pending();
            setPending(null);
          }}
        >
          <p>{r("dirty")}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
