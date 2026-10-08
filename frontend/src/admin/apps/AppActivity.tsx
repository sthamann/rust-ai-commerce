/** API-backed per-app call metadata, storage budgets and explicitly approved durable replay. */
import AppJobs from "./AppJobs";
import { useEffect, useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import ConfirmDialog from "../../shared/ui/ConfirmDialog";
import { useAppOperationsText } from "../../shared/i18n/app-operations-i18n";
type Activity = {
  calls: {
    id: number;
    action: string;
    actor: string;
    status: number;
    durationMs: number;
    at: string;
  }[];
  deliveries: {
    eventId: number;
    kind: string;
    state: "queued" | "running" | "delivered" | "failed";
    attempts: number;
    error: string | null;
  }[];
  storage: {
    rows: number;
    bytes: number;
    rowLimit: number;
    byteLimit: number;
  } | null;
};
export default function AppActivity({
  app,
  request,
}: {
  app: string;
  request: RequestFn;
}) {
  const t = useAppOperationsText();
  const [data, setData] = useState<Activity | null>(null),
    [error, setError] = useState(""),
    [cursor, setCursor] = useState("0"),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [queued, setQueued] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    request(`/api/apps/${app}/activity`)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [app, request]);
  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      setData(await request(`/api/apps/${app}/activity`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const replay = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await request(`/api/apps/${app}/events/replay`, {
        after: Number(cursor),
        limit: 50,
        approve: true,
      });
      setQueued(result.queued);
      setCursor(String(result.nextCursor));
      setConfirm(false);
      setData(await request(`/api/apps/${app}/activity`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <AppJobs app={app} request={request} />
      <section className="app-contract-summary">
        <header className="app-detail-heading">
          <h3>{t("title")}</h3>
          <button
            className="studio-secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {t("refresh")}
          </button>
        </header>
        <p>{t("metadata")}</p>
        {data?.storage && (
          <div className="app-capabilities">
            {["rows", "bytes"].map((key) => {
              const k = key as "rows" | "bytes",
                value = data.storage![k],
                limit = data.storage![k === "rows" ? "rowLimit" : "byteLimit"];
              return (
                <div key={k}>
                  <strong>
                    {value.toLocaleString()} / {limit.toLocaleString()}
                  </strong>
                  <span>{t(k)}</span>
                  <meter value={value} max={limit} />
                </div>
              );
            })}
          </div>
        )}
        <details>
          <summary>
            {t("calls")} · {data?.calls.length ?? 0}
          </summary>
          {data?.calls.map((c) => (
            <p key={c.id}>
              <code>{c.action}</code> · {c.status} · {c.durationMs} ms ·{" "}
              {c.actor} ·{" "}
              <time dateTime={c.at}>{new Date(c.at).toLocaleString()}</time>
            </p>
          ))}
          {!data?.calls.length && <p>{t("empty")}</p>}
        </details>
        <details open>
          <summary>
            {t("deliveries")} · {data?.deliveries.length ?? 0}
          </summary>
          {data?.deliveries.map((d) => (
            <p key={d.eventId}>
              <code>
                #{d.eventId} · {d.kind}
              </code>{" "}
              · {t(d.state)} · {t("attempts")}: {d.attempts}
              {d.error && <small role="alert"> · {d.error}</small>}
            </p>
          ))}
          {!data?.deliveries.length && <p>{t("empty")}</p>}
        </details>
        <form
          className="app-actions"
          onSubmit={(e) => {
            e.preventDefault();
            setConfirm(true);
          }}
        >
          <label>
            {t("cursor")}
            <input
              type="number"
              min="0"
              step="1"
              required
              value={cursor}
              onChange={(e) => setCursor(e.target.value)}
            />
          </label>
          <button
            className="studio-secondary"
            disabled={
              busy ||
              !Number.isSafeInteger(Number(cursor)) ||
              Number(cursor) < 0
            }
          >
            {t("replay")}
          </button>
        </form>
        {queued !== null && (
          <p role="status">
            {t("queued")}: {queued}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {confirm && (
          <ConfirmDialog
            title={t("replay")}
            confirmLabel={t("replay")}
            disabled={busy}
            onCancel={() => setConfirm(false)}
            onConfirm={() => void replay()}
          >
            <p>{t("warning")}</p>
          </ConfirmDialog>
        )}
      </section>
    </>
  );
}
