/** Private environment creation and digest-bound selective release. */
import { useEffect, useState } from "react";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import type { RequestFn } from "../shell/studio-types";
export type Environment = { id: string; name: string };
type Change = {
  key: string;
  before: unknown;
  after: unknown;
  digest: string;
  conflict: boolean;
};
export default function EnvironmentManager({
  request,
  environments,
  onRefresh,
  role,
  onSelect,
}: {
  request: RequestFn;
  environments: Environment[];
  onRefresh: () => Promise<void>;
  role: string;
  onSelect: (id: string) => void;
}) {
  const { w, date } = useWorkbenchText();
  const [name, setName] = useState("");
  const [id, setId] = useState(environments[0]?.id ?? "");
  const [changes, setChanges] = useState<Change[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(false);
  const [history, setHistory] = useState<
    {
      id: string;
      environment: string;
      selections: string[];
      createdAt: string;
    }[]
  >([]);
  const manage = ["owner", "admin"].includes(role);
  const load = async () => {
    const data = await request("/api/environments");
    setHistory(data.releases);
    if (id) {
      setChanges((await request(`/api/environments/${id}/diff`)).changes);
      setSelected([]);
    }
  };
  useEffect(() => {
    let active = true;
    request("/api/environments")
      .then((v) => {
        if (active) setHistory(v.releases);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    if (id)
      request(`/api/environments/${id}/diff`)
        .then((v) => {
          if (active) {
            setChanges(v.changes);
            setSelected([]);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [request, id]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice(false);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="studio-page workbench">
      <div className="page-intro">
        <span className="kicker">{w("stage")}</span>
        <h1>{w("environments")}</h1>
        <p>{w("stageHint")}</p>
      </div>
      <section className="studio-card">
        <form
          className="workbench-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const env = await request("/api/environments", { name });
              await onRefresh();
              setId(env.id);
              setName("");
            });
          }}
        >
          <label>
            {w("stageName")}
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button className="studio-primary" disabled={busy || !manage}>
            {w("newStage")}
          </button>
        </form>
        <p className="muted">{w("exclusion")}</p>
      </section>
      {environments.length > 0 && (
        <section className="studio-card">
          <div className="workbench-row">
            <label>
              {w("stage")}
              <select value={id} onChange={(e) => setId(e.target.value)}>
                <option value="">{w("chooseStage")}</option>
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="studio-secondary"
              disabled={!id}
              onClick={() => onSelect(id)}
            >
              {w("stage")}
            </button>
            <a
              className="studio-secondary"
              target="_blank"
              rel="noreferrer"
              href={`/?shop=${id}&sandbox=1#`}
            >
              {w("preview")} ↗
            </a>
            <button className="studio-secondary" onClick={() => void run(load)}>
              {w("changes")}
            </button>
          </div>
          {!changes.length && <p>{w("noChanges")}</p>}
          {changes.map((c) => (
            <article className="release-change" key={c.key}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(c.key)}
                  disabled={c.conflict || busy || !manage}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, c.key]
                        : selected.filter((k) => k !== c.key),
                    )
                  }
                />
                <strong>{c.key}</strong>
              </label>
              {c.conflict && <p role="alert">{w("conflict")}</p>}
              <details>
                <summary>{w("details")}</summary>
                <div className="diff-columns">
                  <div>
                    <b>{w("before")}</b>
                    <pre>{JSON.stringify(c.before, null, 2)}</pre>
                  </div>
                  <div>
                    <b>{w("after")}</b>
                    <pre>{JSON.stringify(c.after, null, 2)}</pre>
                  </div>
                </div>
              </details>
            </article>
          ))}
          <button
            className="studio-primary"
            disabled={!selected.length || busy || !manage}
            onClick={() =>
              void run(async () => {
                await request(`/api/environments/${id}/release`, {
                  approve: true,
                  selections: changes
                    .filter((c) => selected.includes(c.key))
                    .map((c) => ({ key: c.key, digest: c.digest })),
                });
                await load();
                setNotice(true);
              })
            }
          >
            {w("release")} · {selected.length}
          </button>
        </section>
      )}
      {notice && <p role="status">{w("released")}</p>}
      {error && <p role="alert">{error}</p>}
      <section className="studio-card">
        <h2>{w("history")}</h2>
        {history.map((r) => (
          <p key={r.id}>
            {date(r.createdAt)} · {r.selections.join(", ")}
          </p>
        ))}
      </section>
    </div>
  );
}
