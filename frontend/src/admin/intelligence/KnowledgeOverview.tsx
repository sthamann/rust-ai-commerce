/** Whole-shop knowledge census, operational next steps and provenance activity; examples never masquerade as learned facts. */
import {
  useKnowledgeText,
  type KnowledgeWord,
} from "../../shared/i18n/knowledge-i18n";
import { useLocale } from "../../shared/i18n/i18n";
import Icon from "../../shared/ui/Icon";
import type { Workspace } from "./knowledge-types";
const eventKey: Record<string, KnowledgeWord> = {
  "knowledge.document.ingested": "event_ingested",
  "knowledge.document.updated": "event_updated",
  "knowledge.document.visibility": "event_visibility",
  "knowledge.document.archived": "event_archived",
  "knowledge.document.restored": "event_restored",
  "intelligence.decision": "event_decision",
};
export default function KnowledgeOverview({
  workspace,
  onTab,
  onCreate,
}: {
  workspace: Workspace;
  onTab: (tab: string) => void;
  onCreate: () => void;
}) {
  const k = useKnowledgeText(),
    { number, locale } = useLocale();
  const { totals } = workspace;
  return (
    <>
      <div className="knowledge-census">
        {(
          [
            ["products", "products", "explorer"],
            ["sources", "sources", "sources"],
            ["published", "published", "sources"],
            ["external", "external", "sources"],
            ["observedPairs", "observed", "observations"],
            ["approvedSuggestions", "approved", "observations"],
          ] as const
        ).map(([field, label, tab]) => (
          <button key={field} onClick={() => onTab(tab)}>
            <span className="knowledge-stat-label">{k(label)}</span>
            <strong>{number(totals[field] ?? 0)}</strong>
            <Icon name="arrow" />
          </button>
        ))}
      </div>
      <section className="studio-card knowledge-how">
        <h2>{k("how")}</h2>
        <div>
          {(["collect", "connect", "apply"] as const).map((step, i) => (
            <article key={step}>
              <span className="knowledge-step-icon">
                <Icon name={i === 0 ? "layers" : i === 1 ? "graph" : "spark"} />
              </span>
              <h3>{k(step)}</h3>
              <p>{k(`${step}Text`)}</p>
            </article>
          ))}
        </div>
        <p className="knowledge-boundary">{k("boundary")}</p>
      </section>
      <div className="knowledge-overview-grid">
        <section className="studio-card">
          <h2>{k("gaps")}</h2>
          <div className="knowledge-next">
            {workspace.canWrite && (
              <button onClick={onCreate}>
                <Icon name="plus" />
                <span>
                  <strong>{k("addSource")}</strong>
                  <small>{k("gapSource")}</small>
                </span>
                <Icon name="arrow" />
              </button>
            )}
            <button onClick={() => onTab("sources")}>
              <Icon name="lock" />
              <span>
                <strong>
                  {number((totals.sources ?? 0) - (totals.published ?? 0))} ·{" "}
                  {k("private")}
                </strong>
                <small>{k("gapReview")}</small>
              </span>
              <Icon name="arrow" />
            </button>
            <button onClick={() => onTab("preview")}>
              <Icon name="chat" />
              <span>
                <strong>{k("preview")}</strong>
                <small>{k("gapTest")}</small>
              </span>
              <Icon name="arrow" />
            </button>
          </div>
        </section>
        <section className="studio-card">
          <h2>{k("activity")}</h2>
          {!workspace.activity.length && <p>{k("emptyActivity")}</p>}
          <ol className="knowledge-timeline">
            {workspace.activity.map((e) => (
              <li key={e.id}>
                <span className="knowledge-timeline-dot" />
                <div>
                  <strong>
                    {eventKey[e.kind] ? k(eventKey[e.kind]) : e.kind}
                  </strong>
                  <small>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(e.time))}
                  </small>
                  {e.sourceId && <code>{e.sourceId}</code>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
