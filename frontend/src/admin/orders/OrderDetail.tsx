/** Order workspace: server actions, exact-once commands, provider progress and visible event history. */
import { useCrmText } from "../../shared/i18n/crm-i18n";
import EntityHistory from "../../shared/history/EntityHistory";
import AddressCard from "../../shared/customer/AddressCard";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import "../../shared/styles/customers.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOperationsText } from "../../shared/i18n/operations-i18n";
import type { RequestFn } from "../shell/studio-types";
import OrderPaymentDelivery from "./OrderPaymentDelivery";
import OrderWorkflow, { type OrderAction } from "./OrderWorkflow";
import ReceiptPanel from "./ReceiptPanel";
export default function OrderDetail({
  id,
  request,
  rights,
  onBack,
  download,
  onCustomer,
  onProduct,
}: {
  onCustomer?: (email: string) => void;
  onProduct?: (id: string) => void;
  id: string;
  request: RequestFn;
  rights: string[];
  onBack: () => void;
  download: (path: string) => Promise<void>;
}) {
  const { o, locale } = useOperationsText();
  const { r } = useCrmText();
  const { c } = useCustomerText();
  const [order, setOrder] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState(""),
    [note, setNote] = useState(""),
    [pendingJob, setPendingJob] = useState<string>();
  const inflight = useRef(false);
  const retry = useRef<
    { signature: string; key: string; body: any } | undefined
  >(undefined);
  const load = useCallback(async () => {
    const next = await request(`/api/merchant/orders/${id}`);
    setOrder(next);
    return next;
  }, [request, id]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  const run = async (fn: () => Promise<boolean | void>) => {
    if (inflight.current) return false;
    inflight.current = true;
    setBusy(true);
    setError("");
    setFeedback(o("processing"));
    try {
      const done = await fn();
      await load();
      if (done !== false) setFeedback(o("applied"));
      return done !== false;
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error & { status?: number }).status === 409)
        retry.current = undefined;
      setFeedback("");
      await load().catch(() => {});
      return false;
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  };
  const transition = (a: OrderAction, tracking = "", trackingUrl = "") =>
    void run(async () => {
      const signature = JSON.stringify({
        id,
        action: a.id,
        tracking,
        trackingUrl,
      });
      if (retry.current?.signature !== signature)
        retry.current = {
          signature,
          key: crypto.randomUUID(),
          body: {
            revision: order.revision,
            kind: a.kind,
            state: a.state,
            action: a.kind === "order" ? a.id : undefined,
            deliveryIndex: a.deliveryIndex,
            trackingCode: tracking,
            trackingUrl: a.kind === "delivery" ? trackingUrl : undefined,
          },
        };
      const current = retry.current;
      const result = await request(`/api/merchant/orders/${id}/transition`, {
        ...current.body,
        requestKey: current.key,
      });
      setOrder({ ...order, ...result });
      retry.current = undefined;
    });
  const observe = async (job: string) => {
    setPendingJob(job);
    setFeedback(o("providerWorking"));
    for (let i = 0; i < 60; i++) {
      const result = await request(`/api/payments/jobs/${job}`);
      if (result.state === "succeeded") {
        setPendingJob(undefined);
        retry.current = undefined;
        return true;
      }
      if (["failed", "uncertain"].includes(result.state)) {
        setPendingJob(undefined);
        throw new Error(o("providerFailed"));
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setFeedback(o("providerPending"));
    return false;
  };
  const payment = (operation: string, amount?: number) =>
    run(async () => {
      if (pendingJob) return observe(pendingJob);
      const signature = JSON.stringify({ id, operation, amount });
      if (retry.current?.signature !== signature)
        retry.current = {
          signature,
          key: crypto.randomUUID(),
          body: {
            approve: true,
            ...(amount === undefined ? {} : { amountMinor: amount }),
          },
        };
      const current = retry.current;
      const result = await request(
        `/api/payments/${order.payment.attemptId}/${operation}`,
        { ...current.body, requestKey: current.key },
      );
      return observe(result.jobId);
    });
  const money = (n: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
    }).format(n);
  if (!order) return <p role="status">{error || o("processing")}</p>;
  return (
    <>
      <div className="order-toolbar">
        <button className="studio-secondary" onClick={onBack}>
          ← {r("back")}
        </button>
        <button
          className="studio-secondary"
          disabled={busy}
          onClick={() => void run(() => load().then(() => true))}
        >
          {o("refresh")}
        </button>
      </div>
      <div className="order-heading">
        <div>
          <small>{o("order")}</small>
          <h2>{order.orderNumber}</h2>
          <p>
            {order.orderCustomer?.customerId &&
            onCustomer &&
            rights.includes("customers.read") ? (
              <button
                type="button"
                className="entity-link"
                onClick={() => onCustomer(order.customerEmail)}
              >
                {order.customerEmail}
              </button>
            ) : (
              (order.customerEmail ?? "—")
            )}{" "}
            · {new Date(order.createdAt).toLocaleString(locale)}
          </p>
        </div>
        <div className="order-amount">
          <small>{o("orderTotal")}</small>
          <strong>{money(order.cart.price.totalPrice)}</strong>
        </div>
      </div>
      {error && (
        <p className="operation-feedback is-error" role="alert">
          {error}
        </p>
      )}
      {feedback && (
        <p
          className={`operation-feedback ${busy ? "is-working" : ""}`}
          role="status"
          aria-live="polite"
        >
          {busy && <span className="operation-spinner" />}
          {feedback}
        </p>
      )}
      <OrderWorkflow
        order={order}
        busy={busy}
        canEdit={rights.includes("orders.write")}
        onAction={transition}
      />
      <div className="operations-detail-grid">
        <section className="studio-card">
          <div className="section-heading">
            <h2>{o("items")}</h2>
            <span>{order.cart.lineItems.length}</span>
          </div>
          <div className="operations-table">
            {order.cart.lineItems.map((item: any) => (
              <div className="operation-row" key={item.id}>
                <div>
                  {onProduct &&
                  rights.includes("catalog.read") &&
                  (item.type == null || item.type === "product") &&
                  typeof item.referencedId === "string" ? (
                    <button
                      type="button"
                      className="entity-link"
                      onClick={() => onProduct(item.referencedId)}
                    >
                      <strong>{item.label}</strong>
                    </button>
                  ) : (
                    <strong>{item.label}</strong>
                  )}
                  <small>{item.referencedId}</small>
                </div>
                <span>× {item.quantity}</span>
                <strong>{money(item.price.totalPrice)}</strong>
              </div>
            ))}
          </div>
          <div className="customer-address-grid order-address">
            <div>
              <small>{c("billingAddress")}</small>
              <AddressCard
                address={
                  order.billingAddress ?? order.cart.checkout?.billingAddress
                }
              />
            </div>
            <div>
              <small>{c("shippingAddress")}</small>
              <AddressCard
                address={order.shippingAddress ?? order.cart.checkout?.address}
              />
            </div>
          </div>
          <small>{c("snapshotHint")}</small>
        </section>
        <OrderPaymentDelivery
          order={order}
          busy={busy}
          rights={rights}
          onAction={transition}
          onPayment={payment}
          pendingJob={!!pendingJob}
          onCheck={() => void run(() => observe(pendingJob!))}
        />
      </div>
      {rights.includes("documents.read") && (
        <ReceiptPanel
          order={order}
          request={request}
          canCreate={rights.includes("documents.create")}
          download={download}
        />
      )}
      <EntityHistory
        request={request}
        entity="order"
        id={id}
        revision={order.revision}
      />
      <section className="studio-card order-activity">
        <h2>{o("activity")}</h2>
        {rights.includes("orders.write") && (
          <form
            className="order-note"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await request(`/api/merchant/orders/${id}/notes`, {
                  revision: order.revision,
                  text: note,
                });
                setNote("");
              });
            }}
          >
            <label>
              {o("note")}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required
                maxLength={4000}
              />
            </label>
            <button disabled={busy} className="studio-primary">
              {o("addNote")}
            </button>
          </form>
        )}
        <div className="order-timeline">
          {order.activity.map((event: any) => (
            <div className="operation-event" key={event.id}>
              <span className="timeline-dot" />
              <div>
                <small>
                  {new Date(event.createdAt).toLocaleString(locale)} ·{" "}
                  {event.actor}
                </small>
                <p>
                  {["note", "flow"].includes(event.kind)
                    ? event.data.text
                    : event.kind === "receipt"
                      ? `${o(event.data.kind)} ${event.data.number}`
                      : `${o(event.data.kind)} → ${order.workflow.states.find((s: any) => s.id === event.data.state)?.label?.[locale.slice(0, 2)] ?? o(event.data.state)}`}
                </p>
                {event.kind === "flow" && (
                  <span className="operation-status">
                    {o("flow")} · {event.data.event}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
