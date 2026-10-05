/** Payment ledger, adapter readiness and explicit refund approval. */
import { shopScope } from "../../shared/api/shop-scope";
import { useEffect, useState } from "react";
import { useAppText } from "../../shared/i18n/app-i18n";
import type { RequestFn } from "../shell/studio-types";
type Data = {
  providers: { id: string; configured: boolean }[];
  attempts: {
    id: string;
    orderId: string;
    state: string;
    amountMinor: number;
    refundedMinor: number;
  }[];
  jobs: { id: string; operation: string; state: string; error?: string }[];
};
export default function PaymentManager({
  request,
  token,
  canWrite,
}: {
  request: RequestFn;
  token: string;
  canWrite: boolean;
}) {
  const { a, money } = useAppText();
  const [data, setData] = useState<Data>();
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    request("/api/payments")
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  return (
    <section className="studio-card app-card">
      <h2>{a("sandbox")}</h2>
      <p>
        {data?.providers.find((p) => p.id === "paypal")?.configured
          ? a("connected")
          : a("missing")}
      </p>
      <p>{a("contract")}</p>
      {data?.attempts.map((p) => (
        <article className="app-payment" key={p.id}>
          <strong>{p.orderId}</strong>
          <p>
            {a(p.state)} · {money(p.amountMinor / 100)} ·{" "}
            {money(p.refundedMinor / 100)} {a("refunded")}
          </p>
          {["captured", "partially_refunded"].includes(p.state) && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const amountMinor =
                    amounts[p.id] ?? p.amountMinor - p.refundedMinor;
                  const r = await fetch(`/api/payments/${p.id}/refund`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                      "x-tenant": shopScope(),
                      "Idempotency-Key": `${p.id}:refund:${p.refundedMinor}:${amountMinor}`,
                    },
                    body: JSON.stringify({ amountMinor, approve: true }),
                  });
                  const v = await r.json();
                  if (!r.ok) throw new Error(v.errors?.[0]?.detail);
                  setData(await request("/api/payments"));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                {a("refundAmount")}
                <input
                  type="number"
                  min={1}
                  max={p.amountMinor - p.refundedMinor}
                  value={amounts[p.id] ?? p.amountMinor - p.refundedMinor}
                  onChange={(e) =>
                    setAmounts({ ...amounts, [p.id]: Number(e.target.value) })
                  }
                />
              </label>
              <button className="studio-primary" disabled={!canWrite || busy}>
                {a("refund")}
              </button>
            </form>
          )}
        </article>
      ))}
      {data?.jobs
        .filter((j) => j.error)
        .map((j) => (
          <p role="status" key={j.id}>
            {j.operation}: {j.state} · {j.error}
          </p>
        ))}
      {error && <p role="alert">{error}</p>}
      <button
        className="studio-secondary"
        onClick={() =>
          void request("/api/payments")
            .then(setData)
            .catch((e) => setError(e.message))
        }
      >
        {a("refresh")}
      </button>
    </section>
  );
}
