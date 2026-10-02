/** Read-only product questions cite only tenant-owned, explicitly published source documents. */
import { useEffect, useState } from "react";
import { shopApi } from "./shop-api";
import { useWorkbenchText } from "./workbench-i18n";
type Answer = {
  answer: string;
  missingInformation: boolean;
  sources: { sourceId: string; title: string; excerpt: string }[];
};
export default function ProductQuestion({ productId }: { productId: string }) {
  const { w, locale } = useWorkbenchText();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setAnswer(undefined);
    setError("");
  }, [productId, locale]);
  return (
    <section className="product-question">
      <h2>{w("askProduct")}</h2>
      <p>{w("questionHint")}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            setAnswer(
              await shopApi<Answer>(
                `/store-api/product/${encodeURIComponent(productId)}/questions`,
                { question },
              ),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          aria-label={w("askProduct")}
          placeholder={w("questionPlaceholder")}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={2000}
          required
        />
        <button className="shop-primary" disabled={busy || !question.trim()}>
          {w(busy ? "thinking" : "ask")}
        </button>
      </form>
      {answer && (
        <div role="status">
          <p>{answer.answer}</p>
          {answer.missingInformation && <small>{w("missingFacts")}</small>}
          {answer.sources.length > 0 && (
            <details>
              <summary>{w("sources")}</summary>
              {answer.sources.map((s) => (
                <article key={s.sourceId}>
                  <strong>{s.title}</strong>
                  <p>{s.excerpt}</p>
                </article>
              ))}
            </details>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
