/** Read-only product questions cite only tenant-owned, explicitly published source documents. */
import { useEffect, useRef, useState } from "react";
import { shopApi } from "../../shared/api/shop-api";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
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
  const generation = useRef(0);
  useEffect(() => {
    ++generation.current;
    setAnswer(undefined);
    setError("");
    setBusy(false);
    return () => {
      ++generation.current;
    };
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
          const current = ++generation.current;
          try {
            const result = await shopApi<Answer>(
              `/store-api/product/${encodeURIComponent(productId)}/questions`,
              { question },
            );
            if (current === generation.current) setAnswer(result);
          } catch (e) {
            if (current === generation.current) setError((e as Error).message);
          } finally {
            if (current === generation.current) setBusy(false);
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
