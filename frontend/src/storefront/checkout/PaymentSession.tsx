/** Provider handoff and bounded durable-status polling; only verified server receipts confirm payment. */
import { useEffect, useRef, useState } from "react";
import EmbeddedPayment from "./EmbeddedPayment";
import { shopApi } from "../../shared/api/shop-api";
import { useCheckoutText } from "../../shared/i18n/checkout-i18n";
import { useShopText } from "../../shared/i18n/shop-i18n";
type Status = {
  state: string;
  checkout?: "redirect" | "embedded";
  approvalUrl?: string;
  amountMinor: number;
  currency: string;
  environment: string;
  job?: { state: string; operation: string } | null;
};
const terminal = new Set([
  "captured",
  "captured_late",
  "cancelled",
  "expired",
  "refunded",
  "partially_refunded",
]);
type PaymentProps = { id: string; token: string; autoRedirect?: boolean };
export default function PaymentSession(props: PaymentProps) {
  return <PaymentStatus key={`${props.id}:${props.token}`} {...props} />;
}
function PaymentStatus({ id, token, autoRedirect = false }: PaymentProps) {
  const { x } = useCheckoutText();
  const { s } = useShopText();
  const [data, setData] = useState<Status>();
  const [error, setError] = useState("");
  const [delayed, setDelayed] = useState(false);
  const [generation, setGeneration] = useState(0);
  const action = useRef<Promise<unknown> | null>(null);
  const returned = new URLSearchParams(location.search).get("paymentReturn");
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let count = 0;
    setDelayed(false);
    setError("");
    const tick = async () => {
      try {
        // A forged return flag can only request reconciliation, never fabricate payment approval.
        if (returned && !action.current)
          action.current = shopApi(
            `/store-api/payments/${id}/${returned === "cancelled" ? "cancel" : "reconcile"}`,
            {
              requestKey: `${id}:return:${returned === "cancelled" ? "cancel" : "check"}:${generation}`,
            },
            token,
          );
        if (action.current) await action.current;
        const next = await shopApi<Status>(
          `/store-api/payments/${id}`,
          undefined,
          token,
        );
        if (!active) return;
        setData(next);
        count++;
        if (terminal.has(next.state)) return;
        if (
          count >= 40 ||
          ["failed", "uncertain"].includes(next.job?.state ?? "")
        ) {
          setDelayed(true);
          return;
        }
        timer = setTimeout(() => void tick(), count < 8 ? 1500 : 5000);
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          setDelayed(true);
        }
      }
    };
    void tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, token, returned, generation]);
  const redirected = useRef(false);
  useEffect(() => {
    if (
      autoRedirect &&
      !returned &&
      data?.state === "ready" &&
      data.checkout !== "embedded" &&
      data.approvalUrl &&
      !redirected.current
    ) {
      redirected.current = true;
      window.location.assign(data.approvalUrl);
    }
  }, [autoRedirect, returned, data?.state, data?.approvalUrl, data?.checkout]);
  const retry = () => {
    action.current = shopApi(
      `/store-api/payments/${id}/${data?.state === "approved" ? "capture" : "reconcile"}`,
      { requestKey: `${id}:retry:${generation + 1}` },
      token,
    );
    setGeneration((n) => n + 1);
  };
  const paid =
    data &&
    ["captured", "captured_late", "partially_refunded", "refunded"].includes(
      data.state,
    );
  return (
    <section
      className="payment-session"
      aria-live="polite"
      aria-busy={!data || (!terminal.has(data.state) && !delayed)}
    >
      <small>{x(data?.environment === "live" ? "live" : "test")}</small>
      <h3>
        {paid
          ? x("paid")
          : data && ["cancelled", "expired"].includes(data.state)
            ? x("cancelled")
            : x(
                data?.state === "approved" || returned === "approved"
                  ? "checking"
                  : "pending",
              )}
      </h3>
      {data && (
        <strong>
          {new Intl.NumberFormat(document.documentElement.lang || "en", {
            style: "currency",
            currency: data.currency,
          }).format(data.amountMinor / 100)}
        </strong>
      )}
      {paid && <p>{x("paidHint")}</p>}
      {data?.checkout === "embedded" && data.state === "ready" && !returned && (
        <EmbeddedPayment
          id={id}
          token={token}
          onChanged={retry}
          approvalUrl={data.approvalUrl}
        />
      )}
      {data?.checkout !== "embedded" &&
        data?.approvalUrl &&
        data.state === "ready" &&
        !returned && (
          <a className="shop-primary" href={data.approvalUrl}>
            {x("continuePay")}
          </a>
        )}
      {delayed && !paid && (
        <>
          <p>{x("delayed")}</p>
          <button className="shop-secondary" onClick={retry}>
            {x("retry")}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {data && !terminal.has(data.state) && !returned && (
        <button
          className="shop-text-button"
          onClick={async () => {
            try {
              await shopApi(
                `/store-api/payments/${id}/cancel`,
                { requestKey: `${id}:customer-cancel` },
                token,
              );
              retry();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {s("cancel")}
        </button>
      )}
    </section>
  );
}
