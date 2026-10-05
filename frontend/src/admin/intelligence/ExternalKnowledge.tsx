/** Private connected-app evidence browser shows active-source provenance without exposing it to shoppers. */
import { useEffect, useState } from "react";
import { useKnowledgeText } from "../../shared/i18n/knowledge-i18n";
import Icon from "../../shared/ui/Icon";
import type { RequestFn } from "../shell/studio-types";
import type { ExternalSource } from "./knowledge-types";
export default function ExternalKnowledge({ request }: { request: RequestFn }) {
  const k = useKnowledgeText();
  const [data, setData] = useState<ExternalSource[]>([]),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    request("/api/knowledge/external")
      .then((v) => {
        if (active) setData(v.elements);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [request]);
  return (
    <section className="studio-card">
      <div className="knowledge-section-heading">
        <h2>{k("external")}</h2>
        <span className="knowledge-badge">
          <Icon name="lock" />
          {k("private")}
        </span>
      </div>
      <p>{k("externalHint")}</p>
      <form
        className="knowledge-search"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            setData(
              (
                await request(
                  `/api/knowledge/external?query=${encodeURIComponent(query)}`,
                )
              ).elements,
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          type="search"
          aria-label={k("external")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={k("search")}
        />
        <button className="studio-secondary" disabled={busy}>
          {k("search")}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">{k("loading")}</p>}
      {!busy && !data.length && <p>{k("emptyExternal")}</p>}
      {data.map((s) => (
        <details className="knowledge-excerpt" key={`${s.app}:${s.sourceId}`}>
          <summary>
            <strong>{s.title}</strong>
            <small>
              {s.app} · {s.sourceId}
            </small>
          </summary>
          <p>{s.text}</p>
          <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">
            {k("source")}
          </a>
          <small>
            {k("sourceHash")}: {s.digest}
          </small>
        </details>
      ))}
      <p className="muted">{k("sample")}</p>
    </section>
  );
}
