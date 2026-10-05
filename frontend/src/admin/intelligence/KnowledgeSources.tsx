/** Searchable cursor source library, guarded lifecycle decisions and single-language source editing. */
import { useEffect, useState } from "react";
import { useKnowledgeText } from "../../shared/i18n/knowledge-i18n";
import { useLocale } from "../../shared/i18n/i18n";
import ConfirmDialog from "../../shared/ui/ConfirmDialog";
import Icon from "../../shared/ui/Icon";
import type { RequestFn } from "../shell/studio-types";
import {
  sourceKinds,
  type Source,
  type SourceDetail,
  type Workspace,
} from "./knowledge-types";
import SourceEditor from "./SourceEditor";
export default function KnowledgeSources({
  workspace,
  request,
  onChange,
  create = false,
  onCreateDone,
}: {
  workspace: Workspace;
  request: RequestFn;
  onChange: () => void;
  create?: boolean;
  onCreateDone: () => void;
}) {
  const k = useKnowledgeText(),
    { locale } = useLocale();
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState(""),
    [archived, setArchived] = useState(false),
    [rows, setRows] = useState<Source[]>(workspace.sources),
    [next, setNext] = useState(workspace.next);
  const [editing, setEditing] = useState<SourceDetail>(),
    [selected, setSelected] = useState<SourceDetail>(),
    [newSource, setNew] = useState(create);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [decision, setDecision] = useState<{
    source: SourceDetail;
    action: "publish" | "unpublish" | "archive" | "restore";
  }>();
  const load = async (after = "") => {
    const args = new URLSearchParams({
      query,
      archived: String(archived),
      after,
      kind,
    });
    const v: Workspace = await request(`/api/knowledge/workspace?${args}`);
    setRows((r) => (after ? [...r, ...v.sources] : v.sources));
    setNext(v.next);
  };
  useEffect(() => {
    let active = true;
    setBusy(true);
    setQuery("");
    setError("");
    request(
      `/api/knowledge/workspace?archived=${archived}&kind=${encodeURIComponent(kind)}`,
    )
      .then((v) => {
        if (active) {
          setRows(v.sources);
          setNext(v.next);
        }
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
  }, [request, archived, kind]);
  useEffect(() => {
    if (create) setNew(true);
  }, [create]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const open = async (s: Source) => {
    setSelected(await request(`/api/knowledge/documents/${s.id}`));
    setEditing(undefined);
    setNew(false);
    onCreateDone();
  };
  const saved = () =>
    void run(async () => {
      setEditing(undefined);
      setSelected(undefined);
      setNew(false);
      onCreateDone();
      setNotice(k("saved"));
      await load();
      onChange();
    });
  const name = (s: SourceDetail) =>
    s.translations[locale]?.title ??
    s.translations[workspace.mainLocale]?.title ??
    s.title;
  return (
    <div className="knowledge-source-workspace">
      <div className="knowledge-section-heading">
        <div>
          <h2>{k("sources")}</h2>
          <p>{k("sample")}</p>
        </div>
        {workspace.canWrite && (
          <button
            className="studio-primary"
            disabled={busy}
            onClick={() => {
              setNew(true);
              setEditing(undefined);
              setSelected(undefined);
            }}
          >
            <Icon name="plus" />
            {k("addSource")}
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className="knowledge-alert">
          {error}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {(newSource || editing) && (
        <SourceEditor
          key={editing?.id ?? "new"}
          source={editing}
          workspace={workspace}
          request={request}
          onSaved={saved}
          onCancel={() => {
            setNew(false);
            setEditing(undefined);
            onCreateDone();
          }}
        />
      )}
      {selected && !editing && !newSource && (
        <section className="studio-card knowledge-source-detail">
          <div className="knowledge-section-heading">
            <div>
              <span className="kicker">{k(selected.kind)}</span>
              <h2>{name(selected)}</h2>
            </div>
            <button
              className="studio-secondary"
              onClick={() => setSelected(undefined)}
            >
              {k("cancel")}
            </button>
          </div>
          <p className="knowledge-badge">
            {k(
              selected.archived
                ? "archived"
                : selected.visibility === "public"
                  ? "published"
                  : "private",
            )}{" "}
            · {k("revision")} {selected.revision}
          </p>
          <pre>
            {selected.translations[locale]?.content ??
              selected.translations[workspace.mainLocale]?.content ??
              selected.content}
          </pre>
          <small>
            {k("sourceHash")}: {selected.content_hash}
          </small>
          {workspace.canWrite && (
            <div className="knowledge-actions">
              {!selected.archived && (
                <>
                  <button
                    className="studio-secondary"
                    disabled={busy}
                    onClick={() => setEditing(selected)}
                  >
                    {k("edit")} <Icon name="settings" />
                  </button>
                  <button
                    className="studio-primary"
                    disabled={busy}
                    onClick={() =>
                      setDecision({
                        source: selected,
                        action:
                          selected.visibility === "public"
                            ? "unpublish"
                            : "publish",
                      })
                    }
                  >
                    {k(
                      selected.visibility === "public"
                        ? "unpublish"
                        : "publish",
                    )}
                  </button>
                </>
              )}
              <button
                className="studio-secondary"
                disabled={busy}
                onClick={() =>
                  setDecision({
                    source: selected,
                    action: selected.archived ? "restore" : "archive",
                  })
                }
              >
                {k(selected.archived ? "restore" : "archive")}
              </button>
            </div>
          )}
        </section>
      )}
      <div className="knowledge-source-toolbar">
        <form
          className="knowledge-search"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => load());
          }}
        >
          <input
            type="search"
            aria-label={k("search")}
            placeholder={k("search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="studio-secondary" disabled={busy}>
            <Icon name="search" />
            {k("search")}
          </button>
        </form>
        <select
          aria-label={k("kind")}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">{k("all")}</option>
          {sourceKinds.map((kind) => (
            <option key={kind} value={kind}>
              {k(kind)}
            </option>
          ))}
        </select>
        <button
          className="studio-secondary"
          aria-pressed={archived}
          onClick={() => setArchived(!archived)}
        >
          {k(archived ? "active" : "archived")}
        </button>
      </div>
      <div className="knowledge-source-grid">
        {rows.map((s) => (
          <button
            key={s.id}
            className="knowledge-source-card"
            disabled={busy}
            onClick={() => void run(() => open(s))}
          >
            <span className="knowledge-source-icon">
              <Icon name={s.product_id ? "box" : "layers"} />
            </span>
            <span className="kicker">{k(s.kind)}</span>
            <strong>{s.title}</strong>
            <span className="knowledge-badge">
              {k(
                s.archived
                  ? "archived"
                  : s.visibility === "public"
                    ? "published"
                    : "private",
              )}
            </span>
            <small>
              {s.product_id ?? k("shopWide")} · {s.locale}
            </small>
            <small>
              {s.chunkCount} {k("chunks")} · {s.indexedChunks} {k("indexed")}
            </small>
            <Icon name="arrow" />
          </button>
        ))}
      </div>
      {!rows.length && !busy && <p className="knowledge-empty">{k("empty")}</p>}
      {busy && <p role="status">{k("loading")}</p>}
      {next && (
        <button
          className="studio-secondary"
          disabled={busy}
          onClick={() => void run(() => load(next))}
        >
          {k("more")}
        </button>
      )}
      {decision && (
        <ConfirmDialog
          title={k(decision.action)}
          onCancel={() => {
            if (!busy) setDecision(undefined);
          }}
          disabled={busy}
          confirmLabel={k("confirm")}
          onConfirm={() =>
            void run(async () => {
              const { source, action } = decision;
              await request(
                `/api/knowledge/documents/${source.id}${action === "archive" || action === "restore" ? "/lifecycle" : ""}`,
                {
                  revision: source.revision,
                  approve: true,
                  ...(action === "archive" || action === "restore"
                    ? { archived: action === "archive" }
                    : {
                        visibility: action === "publish" ? "public" : "private",
                      }),
                },
                action === "archive" || action === "restore" ? "POST" : "PUT",
              );
              setDecision(undefined);
              setSelected(
                await request(`/api/knowledge/documents/${source.id}`),
              );
              await load();
              onChange();
              setNotice(k("changed"));
            })
          }
        >
          <p>{decision.source.title}</p>
          <p>
            {k(
              decision.action === "archive" || decision.action === "restore"
                ? "archiveHint"
                : "publishHint",
            )}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
