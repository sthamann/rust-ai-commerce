/** Order operations UI. All changes call the same domain endpoints exposed through MCP. */
import { AppSurfaceSlot } from "../../shared/apps/AppSurfaces";

import { useCallback, useEffect, useState } from "react";
import { downloadFile } from "../../shared/api/download";
import { useOperationsText } from "../../shared/i18n/operations-i18n";
import type { RequestFn } from "../shell/studio-types";
import type { OpenEntity } from "../shell/useEntityNavigation";
import OrderDetail from "./OrderDetail";
export default function OrdersManager({
  request,
  headers,
  initialId,
  onEntity,
  onEntityBack,
}: {
  request: RequestFn;
  headers: Record<string, string>;
  initialId?: string;
  onEntity?: OpenEntity;
  onEntityBack?: () => void;
}) {
  const { o, locale } = useOperationsText();
  const [rows, setRows] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [cursor, setCursor] = useState<string>(),
    [selected, setSelected] = useState<string>(),
    [error, setError] = useState(""),
    [rights, setRights] = useState<string[]>([]);
  useEffect(() => setSelected(initialId), [initialId]);
  const load = useCallback(
    async (after = "") => {
      try {
        const v = await request(
          `/api/merchant/orders?query=${encodeURIComponent(query)}&after=${encodeURIComponent(after)}`,
        );
        setRows((prev) => (after ? [...prev, ...v.elements] : v.elements));
        setCursor(v.nextCursor);
        setError("");
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [request, query],
  );
  useEffect(() => {
    void load();
    request("/api/auth/access")
      .then((v) => setRights(v.permissions))
      .catch((e) => setError(e.message));
  }, [load, request]);
  return (
    <div className="studio-page workbench operations">
      <div className="page-intro">
        <h1>{o("orders")}</h1>
        <p>{o("ordersHint")}</p>
      </div>
      {error && <p role="alert">{error}</p>}
      {selected ? (
        <>
          <AppSurfaceSlot
            location="admin.order"
            context={{ orderId: selected }}
          />
          <OrderDetail
            id={selected}
            request={request}
            rights={rights}
            onCustomer={(email) => onEntity?.("customers", email)}
            onProduct={(id) => onEntity?.("productData", id)}
            onBack={() => {
              if (onEntityBack) {
                onEntityBack();
                return;
              }
              setSelected(undefined);
              void load();
            }}
            download={(path) => downloadFile(path, headers)}
          />
        </>
      ) : (
        <section className="studio-card">
          <label>
            {o("search")}
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="operations-table">
            {rows.map((row) => (
              <button
                className="operation-row"
                key={row.id}
                onClick={() =>
                  onEntity ? onEntity("orders", row.id) : setSelected(row.id)
                }
              >
                <strong>{row.orderNumber}</strong>
                <span>{row.customerEmail ?? "—"}</span>
                <span className="operation-status">{o(row.state)}</span>
                <strong>
                  {new Intl.NumberFormat(locale, {
                    style: "currency",
                    currency: "EUR",
                  }).format(row.cart.price.totalPrice)}
                </strong>
              </button>
            ))}
          </div>
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
