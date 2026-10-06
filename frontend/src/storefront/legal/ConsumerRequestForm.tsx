/** Public two-step declaration with immutable downloadable receipt; references never expose order data. */
import { useState } from "react";
import { shopApi } from "../../shared/api/shop-api";
import { useLegalText, type LegalWord } from "../../shared/i18n/legal-i18n";
import type { ConsumerRequest } from "../../shared/legal/legal-types";
export default function ConsumerRequestForm({
  token,
  withdrawal = false,
}: {
  token?: string;
  withdrawal?: boolean;
}) {
  const { l } = useLegalText();
  const [kind, setKind] = useState(withdrawal ? "withdrawal" : "access"),
    [data, setData] = useState({
      name: "",
      email: "",
      reference: "",
      message: "",
    }),
    [review, setReview] = useState(false),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [result, setResult] = useState<ConsumerRequest>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="shop-content legal-document">
      <span className="legal-eyebrow">{l("title")}</span>
      <h1>{l(withdrawal ? "withdrawHere" : "rights")}</h1>
      <p>{l("requestHint")}</p>
      {result ? (
        <section role="status">
          <h2>{l("requestReceived")}</h2>
          <p>{result.data.receivedAt}</p>
          <p>{result.data.reference}</p>
          <a
            className="shop-primary"
            download={`vendune-${result.id}.txt`}
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(JSON.stringify(result, null, 2))}`}
          >
            {l("download")}
          </a>
        </section>
      ) : (
        <form
          className="legal-request-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!review) {
              setReview(true);
              return;
            }
            if (busy || !token) return;
            setBusy(true);
            setError("");
            try {
              setResult(
                await shopApi<ConsumerRequest>(
                  "/store-api/legal/requests",
                  { ...data, kind, requestKey: key },
                  token,
                ),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {!withdrawal && (
            <label>
              {l("rights")}
              <select
                disabled={review || busy}
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setKey(crypto.randomUUID());
                }}
              >
                {["access", "erase", "correct", "portability", "objection"].map(
                  (k) => (
                    <option key={k} value={k}>
                      {l(k as LegalWord)}
                    </option>
                  ),
                )}
              </select>
            </label>
          )}
          {(["name", "email", "reference", "message"] as const).map((k) => (
            <label key={k}>
              {l(k)}
              {k === "message" ? (
                <textarea
                  readOnly={review}
                  value={data[k]}
                  maxLength={6000}
                  onChange={(e) => setData({ ...data, [k]: e.target.value })}
                />
              ) : (
                <input
                  type={k === "email" ? "email" : "text"}
                  autoComplete={
                    k === "email" ? "email" : k === "name" ? "name" : "off"
                  }
                  required={k !== "reference" || withdrawal}
                  readOnly={review}
                  maxLength={k === "email" ? 254 : 200}
                  value={data[k]}
                  onChange={(e) => setData({ ...data, [k]: e.target.value })}
                />
              )}
            </label>
          ))}
          {error && <p role="alert">{error}</p>}
          <div className="privacy-actions">
            {review && (
              <button type="button" onClick={() => setReview(false)}>
                {l("editDeclaration")}
              </button>
            )}
            <button className="shop-primary" disabled={busy || !token}>
              {l(
                review
                  ? withdrawal
                    ? "confirmWithdrawal"
                    : "submitRequest"
                  : "reviewDeclaration",
              )}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
