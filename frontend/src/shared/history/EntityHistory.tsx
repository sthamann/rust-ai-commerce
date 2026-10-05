/** On-demand entity history, field comparisons and explicitly confirmed revision-checked restoration. */
import { useEffect, useRef, useState } from "react";
import type { RequestFn } from "../api/types";
import { useCrmText } from "../i18n/crm-i18n";
import ConfirmDialog from "../ui/ConfirmDialog";
import { changes, printable } from "./history-model";
import "./history.css";
type Entry = {
  id: number;
  revision: number | null;
  actor: string | null;
  actorLabel?: string;
  source: string;
  reason: string | null;
  createdAt: string;
  hasPrevious: boolean;
};
type Detail = { id: number; before: unknown; after: unknown };
export default function EntityHistory({
  request,
  entity,
  id,
  revision,
  dirty = false,
  onRestored,
}: {
  request: RequestFn;
  entity: string;
  id: string;
  revision?: number;
  dirty?: boolean;
  onRestored?: () => Promise<unknown>;
}) {
  const { r, locale } = useCrmText();
  const [open, setOpen] = useState(false),
    [entries, setEntries] = useState<Entry[]>([]),
    [cursor, setCursor] = useState<number | null>(null),
    [canRestore, setCanRestore] = useState(false);
  const [detail, setDetail] = useState<Detail>(),
    [pending, setPending] = useState<"before" | "after">(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState("");
  const current = useRef(request);
  current.current = request;
  const scope = useRef(0),
    inflight = useRef(false);
  const path = `/api/history/${entity}/${encodeURIComponent(id)}`;
  const load = async (before?: number, generation = scope.current) => {
    const v = await current.current(
      `${path}${before ? `?before=${before}` : ""}`,
    );
    if (generation !== scope.current) return;
    setEntries((old) => (before ? [...old, ...v.elements] : v.elements));
    setCursor(v.nextCursor);
    setCanRestore(v.canRestore);
  };
  useEffect(() => {
    const generation = ++scope.current;
    setDetail(undefined);
    setPending(undefined);
    setEntries([]);
    setError("");
    setFeedback("");
    if (open)
      void load(undefined, generation).catch((e) => {
        if (generation === scope.current) setError(e.message);
      });
    return () => {
      scope.current++;
    };
  }, [path, open, revision]);
  const run = async (fn: () => Promise<unknown>) => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="entity-history">
      <button
        type="button"
        className="history-disclosure"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>◷ {r("history")}</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="history-body">
          <p className="history-hint">{r("historyHint")}</p>
          {error && <p role="alert">{error}</p>}
          {feedback && <p role="status">{feedback}</p>}
          {entity === "order" && <p>{r("readonly")}</p>}
          {!entries.length && !error && <p>{r("empty")}</p>}
          <div className="history-entries">
            {entries.map((entry) => (
              <button
                type="button"
                className="history-entry"
                aria-pressed={detail?.id === entry.id}
                key={entry.id}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const generation = scope.current,
                      next = await current.current(`${path}/${entry.id}`);
                    if (generation === scope.current) {
                      setDetail(next);
                      setPending(undefined);
                    }
                  })
                }
              >
                <span>
                  <strong>
                    {entry.revision == null
                      ? `#${entry.id}`
                      : `v${entry.revision}`}
                  </strong>
                  <small>
                    {new Date(entry.createdAt).toLocaleString(locale)}
                  </small>
                </span>
                <span>
                  {entry.actorLabel || entry.actor || r("system")}
                  <small>
                    {entry.source === "merchant" || entry.source === "customer"
                      ? r(entry.source)
                      : entry.source}
                    {entry.reason ? ` · ${entry.reason}` : ""}
                  </small>
                </span>
                <span>{r("inspect")} →</span>
              </button>
            ))}
          </div>
          {cursor && (
            <button
              type="button"
              className="studio-secondary"
              disabled={busy}
              onClick={() => void run(() => load(cursor))}
            >
              {r("more")}
            </button>
          )}
          {detail && (
            <div className="history-comparison">
              <table>
                <thead>
                  <tr>
                    <th>{r("field")}</th>
                    <th>{r("before")}</th>
                    <th>{r("after")}</th>
                  </tr>
                </thead>
                <tbody>
                  {changes(detail.before, detail.after).map((c) => (
                    <tr key={c.path}>
                      <th>{c.path}</th>
                      <td>
                        <pre>{printable(c.before)}</pre>
                      </td>
                      <td>
                        <pre>{printable(c.after)}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dirty && <p role="status">{r("dirty")}</p>}
              {canRestore && onRestored && (
                <div className="history-actions">
                  {(["before", "after"] as const)
                    .filter((side) => detail[side] != null)
                    .map((side) => (
                      <button
                        type="button"
                        className="studio-secondary"
                        disabled={dirty || busy || revision == null}
                        key={side}
                        onClick={() => setPending(side)}
                      >
                        {r(
                          side === "before" ? "restoreBefore" : "restoreAfter",
                        )}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {pending && detail && (
        <ConfirmDialog
          title={r("restore")}
          confirmLabel={r("restore")}
          disabled={busy || dirty}
          onCancel={() => {
            if (!busy) setPending(undefined);
          }}
          onConfirm={() =>
            void run(async () => {
              if (dirty || revision == null || !onRestored) return;
              await current.current(`${path}/${detail.id}/restore`, {
                approve: true,
                revision,
                side: pending,
              });
              await onRestored();
              setPending(undefined);
              setDetail(undefined);
              await load();
              setFeedback(r("restored"));
            })
          }
        >
          <p>{r("restoreHint")}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
