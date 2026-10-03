/** Native app workspace: OAuth, provider settings, durable jobs and private sources. */
import { useEffect, useState } from "react";
import { useConnectedText } from "../../shared/i18n/connected-i18n";
import type { RequestFn } from "../shell/studio-types";
export default function ConnectorPanel({
  app,
  request,
  manage,
}: {
  app: string;
  request: RequestFn;
  manage: boolean;
}) {
  const { x } = useConnectedText();
  const [status, setStatus] = useState<any>();
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const call = (name: string, value: unknown = {}) =>
    request(`/api/apps/${app}/actions/${name}`, value);
  const refresh = async () => {
    const v = await call("status");
    setStatus(v);
    if (!dirty) setSettings(v.settings);
    if (app !== "slack") {
      const s = await request("/api/knowledge/external");
      setSources(s.elements.filter((r: any) => r.app === app));
    }
  };
  useEffect(() => {
    let active = true;
    Promise.all([
      call("status"),
      app === "slack"
        ? Promise.resolve({ elements: [] })
        : request("/api/knowledge/external"),
    ])
      .then(([v, evidence]) => {
        if (active) {
          setStatus(v);
          setSettings(v.settings);
          setSources(evidence.elements.filter((r: any) => r.app === app));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [app, request]);
  useEffect(() => {
    if (!status?.jobs.some((j: any) => ["queued", "running"].includes(j.state)))
      return;
    const timer = setInterval(
      () => void refresh().catch((e) => setError(e.message)),
      1500,
    );
    return () => clearInterval(timer);
  }, [status, app, dirty]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const field = (key: string, label: string, placeholder = "") => (
    <label>
      {x(label)}
      <input
        value={settings[key] ?? ""}
        placeholder={placeholder}
        disabled={!manage || busy}
        onChange={(e) => {
          setDirty(true);
          setSettings((s) => ({ ...s, [key]: e.target.value }));
        }}
      />
    </label>
  );
  return (
    <div className="connector-panel">
      <header>
        <div>
          <span className="kicker">{x("connection")}</span>
          <h3>{x(status?.connected ? "connected" : "disconnected")}</h3>
        </div>
        <button
          type="button"
          className="studio-secondary"
          disabled={busy}
          onClick={() => void run(refresh)}
        >
          {x("refresh")}
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {status && !status.oauthClientConfigured && <p>{x("setup")}</p>}
      <p>
        {x(
          app === "gmail"
            ? "mailHint"
            : app === "slack"
              ? "slackHint"
              : "gaHint",
        )}
      </p>
      <div className="workbench-row">
        <button
          type="button"
          className="studio-primary"
          disabled={!manage || busy || !status?.oauthClientConfigured}
          onClick={() => {
            const popup = window.open("about:blank", "_blank");
            if (popup) popup.opener = null;
            void run(async () => {
              try {
                const v = await call("connect");
                if (popup) popup.location.href = v.authorizationUrl;
              } catch (e) {
                popup?.close();
                throw e;
              }
            });
          }}
        >
          {x("connect")}
        </button>
        {status?.connected && (
          <button
            type="button"
            className="studio-secondary"
            disabled={!manage || busy}
            onClick={() => void run(() => call("disconnect"))}
          >
            {x("disconnect")}
          </button>
        )}
      </div>
      <div className="connector-settings">
        {app === "google_analytics" ? (
          <>
            {field("measurementId", "measurement", "G-XXXXXXXXXX")}
            {field("propertyId", "property", "123456789")}
            {field("salesChannel", "channel")}
          </>
        ) : app === "gmail" ? (
          field("labelId", "label", "INBOX")
        ) : (
          <>
            {field("channelId", "slackChannel", "C0123456789")}
            {field(
              "template",
              "template",
              "Order {orderNumber} · {totalPrice} EUR",
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                disabled={!manage || busy}
                checked={settings.notifyOrders ?? false}
                onChange={(e) => {
                  setDirty(true);
                  setSettings((s) => ({
                    ...s,
                    notifyOrders: e.target.checked,
                  }));
                }}
              />
              {x("automatic")}
            </label>
          </>
        )}
        {app !== "google_analytics" && status?.connected && (
          <>
            <button
              type="button"
              className="studio-secondary"
              disabled={!manage || busy}
              onClick={() =>
                void run(async () => {
                  const v = await call(app === "slack" ? "channels" : "labels");
                  setChoices(v.channels ?? v.labels ?? []);
                })
              }
            >
              {x("choose")}
            </button>
            {choices.length > 0 && (
              <select
                aria-label={x(app === "slack" ? "slackChannel" : "label")}
                value={
                  settings[app === "slack" ? "channelId" : "labelId"] ?? ""
                }
                onChange={(e) => {
                  setDirty(true);
                  setSettings((s) => ({
                    ...s,
                    [app === "slack" ? "channelId" : "labelId"]: e.target.value,
                  }));
                }}
              >
                <option value="">—</option>
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        <button
          type="button"
          className="studio-primary"
          disabled={!manage || busy || !status}
          onClick={() =>
            void run(async () => {
              const v = await call("configure", {
                revision: status.revision,
                settings,
              });
              setStatus(v);
              setSettings(v.settings);
              setDirty(false);
            })
          }
        >
          {x("save")}
        </button>
        {app !== "slack" && (
          <button
            type="button"
            className="studio-secondary"
            disabled={!manage || busy || !status?.connected}
            onClick={() =>
              void run(() => call("sync", { requestKey: crypto.randomUUID() }))
            }
          >
            {x("sync")}
          </button>
        )}
      </div>
      {app !== "slack" && (
        <section>
          <h3>{x("private")}</h3>
          <p>{x("privacy")}</p>
          {!sources.length ? (
            <p>{x("empty")}</p>
          ) : (
            sources.map((s) => (
              <a
                className="search-hit"
                key={s.sourceId}
                href={s.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {s.title}
                <small>{s.sourceId}</small>
              </a>
            ))
          )}
        </section>
      )}
      <section>
        <h3>{x("jobs")}</h3>
        {status?.jobs.map((j: any) => (
          <div className="connector-job" key={j.id}>
            <strong>{x(j.state)}</strong>
            <small>{j.id}</small>
          </div>
        ))}
      </section>
    </div>
  );
}
