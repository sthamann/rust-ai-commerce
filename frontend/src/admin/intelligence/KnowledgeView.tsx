/** Unified knowledge workspace connects sources, product evidence, observations and no-model retrieval previews. */
import { useEffect, useState } from "react";
import {
  useKnowledgeText,
  type KnowledgeWord,
} from "../../shared/i18n/knowledge-i18n";
import { useLocale } from "../../shared/i18n/i18n";
import Icon from "../../shared/ui/Icon";
import type { Overview, RequestFn } from "../shell/studio-types";
import type { Workspace } from "./knowledge-types";
import KnowledgeOverview from "./KnowledgeOverview";
import KnowledgeSources from "./KnowledgeSources";
import KnowledgeExplorer from "./KnowledgeExplorer";
import KnowledgePreview from "./KnowledgePreview";
import ExternalKnowledge from "./ExternalKnowledge";
import MemoryView from "./MemoryView";
import "../styles/knowledge.css";
import "../styles/knowledge-sources.css";
import "../styles/knowledge-evidence.css";
export function KnowledgeView({
  focus,
  data,
  request,
  onIntent,
  onProduct,
}: {
  focus: string;
  data: Overview;
  request: RequestFn;
  onIntent: (s: string) => void;
  onProduct: (id: string) => void;
}) {
  const k = useKnowledgeText(),
    { number } = useLocale();
  const [tab, setTab] = useState("overview"),
    [workspace, setWorkspace] = useState<Workspace>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [create, setCreate] = useState(false);
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      setWorkspace(await request("/api/knowledge/workspace"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    setBusy(true);
    request("/api/knowledge/workspace")
      .then((v) => {
        if (active) setWorkspace(v);
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
  const newSource = () => {
    setTab("sources");
    setCreate(true);
  };
  return (
    <div className="studio-page knowledge-workspace">
      <div className="page-intro knowledge-intro">
        <div>
          <span className="kicker">
            {k("overview")} / {k("sources")}
          </span>
          <h1>{k("heading")}</h1>
          <p>{k("intro")}</p>
        </div>
        <button
          className="studio-secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          <Icon name="refresh" />
          {k("refresh")}
        </button>
      </div>
      <nav className="knowledge-tabs" aria-label={k("heading")}>
        {(
          [
            "overview",
            "explorer",
            "sources",
            "observations",
            "preview",
          ] as KnowledgeWord[]
        ).map((item) => (
          <button
            key={item}
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
          >
            <Icon
              name={
                item === "overview"
                  ? "layers"
                  : item === "explorer"
                    ? "graph"
                    : item === "sources"
                      ? "box"
                      : item === "observations"
                        ? "pulse"
                        : "chat"
              }
            />
            {k(item)}
          </button>
        ))}
      </nav>
      {error && (
        <div className="knowledge-alert" role="alert">
          {error}
          <button
            className="studio-secondary"
            disabled={busy}
            onClick={() => void load()}
          >
            {k("retry")}
          </button>
        </div>
      )}
      {busy && !workspace && <p role="status">{k("loading")}</p>}
      {workspace && (
        <>
          {tab === "overview" && (
            <KnowledgeOverview
              workspace={workspace}
              onTab={setTab}
              onCreate={newSource}
            />
          )}{" "}
          {tab === "sources" && (
            <>
              <KnowledgeSources
                workspace={workspace}
                request={request}
                onChange={() => void load()}
                create={create}
                onCreateDone={() => setCreate(false)}
              />
              <ExternalKnowledge request={request} />
            </>
          )}
          {tab === "explorer" && (
            <KnowledgeExplorer
              focus={focus}
              products={data.products}
              request={request}
              onProduct={onProduct}
              onIntent={onIntent}
            />
          )}
          {tab === "preview" && (
            <KnowledgePreview
              products={data.products}
              request={request}
              onIntent={onIntent}
            />
          )}
          {tab === "observations" && (
            <>
              <div className="knowledge-census">
                {(
                  [
                    "productViews",
                    "cartAdds",
                    "reviews",
                    "processedEvents",
                  ] as const
                ).map((field, i) => (
                  <div key={field}>
                    <span>
                      {k(
                        (
                          ["views", "cartAdds", "reviews", "processed"] as const
                        )[i],
                      )}
                    </span>
                    <strong>{number(workspace.totals[field] ?? 0)}</strong>
                  </div>
                ))}
              </div>
              <p className="muted">{k("viewsHint")}</p>
              <MemoryView
                request={request}
                products={data.products}
                canWrite={workspace.canWrite}
                onChange={() => void load()}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
