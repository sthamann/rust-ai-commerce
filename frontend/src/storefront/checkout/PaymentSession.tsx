/** Customer payment handoff; browser navigation never marks a payment as captured. */
import { shopScope } from "../../shared/api/shop-scope";
import { useEffect, useState } from "react";
import { shopApi } from "../../shared/api/shop-api";
import { useAppText } from "../../shared/i18n/app-i18n";
type Status = {
  state: string;
  approvalUrl?: string;
  amountMinor: number;
  currency: string;
};
export default function PaymentSession({
  id,
  token,
}: {
  id: string;
  token: string;
}) {
  const { a, money } = useAppText();
  const [data, setData] = useState<Status>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () =>
    shopApi<Status>(`/store-api/payments/${id}`, undefined, token).then(
      setData,
    );
  useEffect(() => {
    let active = true;
    const tick = () =>
      shopApi<Status>(`/store-api/payments/${id}`, undefined, token)
        .then((v) => {
          if (active) setData(v);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void tick();
    const timer = setInterval(() => void tick(), 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, token]);
  const command = async (op: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/store-api/payments/${id}/${op}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "sw-context-token": token,
          "x-tenant": shopScope(),
          "Idempotency-Key": `${id}:${op}:${crypto.randomUUID()}`,
        },
        body: "{}",
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.errors?.[0]?.detail);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="app-slot payment-session">
      <strong>{a("sandbox")}</strong>
      <h3>{a(data?.state ?? "pending")}</h3>
      {data && <p>{money(data.amountMinor / 100)}</p>}
      {data?.approvalUrl && ["ready", "approved"].includes(data.state) && (
        <a className="shop-primary" href={data.approvalUrl}>
          {a("pay")}
        </a>
      )}
      {data && ["ready", "approved"].includes(data.state) && (
        <button
          className="shop-secondary"
          disabled={busy}
          onClick={() => void command("capture")}
        >
          {a("capture")}
        </button>
      )}
      <button
        className="shop-secondary"
        disabled={busy}
        onClick={() => void command("reconcile")}
      >
        {a("refresh")}
      </button>
      {data && ["pending", "ready", "approved"].includes(data.state) && (
        <button
          className="shop-secondary"
          disabled={busy}
          onClick={() => void command("cancel")}
        >
          {a("cancel")}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
