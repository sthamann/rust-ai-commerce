/** Native email app settings, localized templates, safe previews and durable delivery receipts. */
import { useEffect, useRef, useState } from "react";
import type { RequestFn } from "./studio-types";
import { useEmailText } from "./email-i18n";
import { useLocale } from "./i18n";
const languages = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
};
export default function EmailPanel({
  request,
  manage,
}: {
  request: RequestFn;
  manage: boolean;
}) {
  const { e } = useEmailText();
  const { locale } = useLocale();
  const [status, setStatus] = useState<any>();
  const [settings, setSettings] = useState<any>();
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [language, setLanguage] = useState(locale.split("-")[0]);
  const [recipient, setRecipient] = useState("");
  const [preview, setPreview] = useState<any>();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(false);
  const locked = useRef(false);
  const draftChanged = useRef(false);
  const call = (name: string, value: unknown = {}) =>
    request(`/api/apps/email/actions/${name}`, value);
  const refresh = async () => setStatus(await call("status"));
  useEffect(() => {
    let active = true;
    call("status")
      .then((v) => {
        if (active) {
          setStatus(v);
          if (!draftChanged.current) setSettings(v.settings);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [request]);
  useEffect(() => {
    if (!status?.jobs.some((j: any) => ["queued", "running"].includes(j.state)))
      return;
    const timer = setInterval(
      () => void refresh().catch(() => setError(true)),
      1500,
    );
    return () => clearInterval(timer);
  }, [status, request]);
  const run = async (fn: () => Promise<unknown>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(false);
    try {
      await fn();
      await refresh();
    } catch {
      setError(true);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const change = (key: string, value: unknown) => {
    setSettings((s: any) => ({ ...s, [key]: value }));
    draftChanged.current = true;
    setDirty(true);
    setPreview(undefined);
  };
  const field = (key: string, type = "text") => (
    <label>
      {e(key)}
      <input
        type={type}
        disabled={!manage || busy}
        value={settings?.[key] ?? ""}
        onChange={(ev) =>
          change(
            key,
            type === "number" ? Number(ev.target.value) : ev.target.value,
          )
        }
      />
    </label>
  );
  const secret = (key: string) => (
    <label>
      {e(key)}
      <input
        type="password"
        autoComplete="new-password"
        disabled={!manage || busy}
        placeholder={status?.credentialsConfigured[key] ? e("configured") : ""}
        value={credentials[key] ?? ""}
        onChange={(ev) => {
          setCredentials((c) => ({ ...c, [key]: ev.target.value }));
          draftChanged.current = true;
          setDirty(true);
        }}
      />
    </label>
  );
  const template = {
    ...status?.defaultTemplates?.[language],
    ...settings?.templates?.[language],
  };
  const editTemplate = (key: string, value: string) =>
    change("templates", {
      ...settings.templates,
      [language]: { ...template, [key]: value },
    });
  const sample = {
    event: {
      order: {
        orderNumber: "DEMO-2026",
        orderCustomer: { email: recipient, firstName: "Alex" },
        cart: { price: { totalPrice: 49.9 } },
        currencyId: "EUR",
      },
    },
    locale: language,
  };
  const test = async (dryRun: boolean) => {
    const v = await call("preview_order", sample);
    setPreview(v.mail);
    await call("send", {
      requestKey: crypto.randomUUID(),
      message: Object.fromEntries(
        Object.entries(v.mail).filter(
          ([k]) => !["fromEmail", "fromName"].includes(k),
        ),
      ),
      dryRun,
    });
  };
  return (
    <div className="connector-panel email-panel">
      <header>
        <div>
          <span className="kicker">SMTP · Resend · SendGrid</span>
          <h3>{e("title")}</h3>
          <p>{e("hint")}</p>
        </div>
        <button
          className="studio-secondary"
          disabled={busy}
          onClick={() => void run(refresh)}
        >
          {e("refresh")}
        </button>
      </header>
      {error && <p role="alert">{e("error")}</p>}
      {settings && (
        <>
          <div className="connector-settings">
            <label>
              {e("provider")}
              <select
                disabled={!manage || busy}
                value={settings.provider}
                onChange={(ev) => change("provider", ev.target.value)}
              >
                <option value="smtp">SMTP</option>
                <option value="resend">Resend</option>
                <option value="sendgrid">SendGrid</option>
              </select>
            </label>
            {field("fromEmail", "email")}
            {field("fromName")}
            {field("replyTo", "email")}
            {settings.provider === "smtp" ? (
              <>
                {field("smtpHost")}
                {field("smtpPort", "number")}
                <label>
                  {e("smtpSecurity")}
                  <select
                    disabled={!manage || busy}
                    value={settings.smtpSecurity}
                    onChange={(ev) => change("smtpSecurity", ev.target.value)}
                  >
                    <option value="starttls">STARTTLS · 587</option>
                    <option value="tls">TLS · 465</option>
                  </select>
                </label>
                {field("smtpUsername")}
                {secret("smtpPassword")}
                <p>{e("approval")}</p>
              </>
            ) : (
              <>
                {secret("apiKey")}
                {settings.provider === "sendgrid" && (
                  <label>
                    {e("region")}
                    <select
                      disabled={!manage || busy}
                      value={settings.region}
                      onChange={(ev) => change("region", ev.target.value)}
                    >
                      <option value="global">{e("global")}</option>
                      <option value="eu">{e("eu")}</option>
                    </select>
                  </label>
                )}
              </>
            )}
            <p>{e("secrets")}</p>
            {["enabled", "dryRun", "notifyOrders"].map((key) => (
              <label className="checkbox-label" key={key}>
                <input
                  type="checkbox"
                  disabled={!manage || busy}
                  checked={settings[key]}
                  onChange={(ev) => change(key, ev.target.checked)}
                />
                {e(key === "notifyOrders" ? "automatic" : key)}
              </label>
            ))}
            <label>
              {e("locale")}
              <select
                disabled={!manage || busy}
                value={settings.locale}
                onChange={(ev) => change("locale", ev.target.value)}
              >
                {Object.entries(languages).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <section>
            <h3>{e("templates")}</h3>
            <label>
              {e("language")}
              <select
                value={language}
                onChange={(ev) => {
                  setLanguage(ev.target.value);
                  setPreview(undefined);
                }}
              >
                {Object.entries(languages).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <p>{e("variables")}</p>
            {["subject", "text", "html"].map((key) => (
              <label key={key}>
                {e(key)}
                {key === "subject" ? (
                  <input
                    disabled={!manage || busy}
                    value={template[key] ?? ""}
                    onChange={(ev) => editTemplate(key, ev.target.value)}
                  />
                ) : (
                  <textarea
                    rows={key === "text" ? 4 : 2}
                    disabled={!manage || busy}
                    value={template[key] ?? ""}
                    onChange={(ev) => editTemplate(key, ev.target.value)}
                  />
                )}
              </label>
            ))}
          </section>
          <button
            className="studio-primary"
            disabled={!manage || busy || !dirty}
            onClick={() =>
              void run(async () => {
                const v = await call("configure", {
                  revision: status.revision,
                  settings,
                  credentials: Object.fromEntries(
                    Object.entries(credentials).filter(([, v]) => v),
                  ),
                });
                setStatus(v);
                setSettings(v.settings);
                setCredentials({});
                draftChanged.current = false;
                setDirty(false);
              })
            }
          >
            {e("save")}
          </button>
          <button
            className="studio-secondary"
            disabled={!manage || busy || dirty}
            onClick={() =>
              void run(async () => {
                const v = await call("configure", {
                  revision: status.revision,
                  settings: { ...settings, enabled: false },
                  credentials: { apiKey: "", smtpPassword: "" },
                });
                setSettings(v.settings);
                setCredentials({});
              })
            }
          >
            {e("removeCredentials")}
          </button>
          <section>
            <h3>{e("test")}</h3>
            <label>
              {e("recipient")}
              <input
                type="email"
                value={recipient}
                onChange={(ev) => {
                  setRecipient(ev.target.value);
                  setPreview(undefined);
                }}
              />
            </label>
            {dirty && <p>{e("savedFirst")}</p>}
            <div className="workbench-row">
              <button
                className="studio-secondary"
                disabled={!manage || busy || dirty || !recipient}
                onClick={() =>
                  void run(async () =>
                    setPreview((await call("preview_order", sample)).mail),
                  )
                }
              >
                {e("preview")}
              </button>
              <button
                className="studio-secondary"
                disabled={
                  !manage || busy || dirty || !settings.enabled || !recipient
                }
                onClick={() => void run(() => test(true))}
              >
                {e("simulate")}
              </button>
              <button
                className="studio-primary"
                disabled={
                  !manage ||
                  busy ||
                  dirty ||
                  settings.dryRun ||
                  !settings.enabled ||
                  !status.connected ||
                  !recipient
                }
                onClick={() => void run(() => test(false))}
              >
                {e("send")}
              </button>
            </div>
            {preview && (
              <article className="email-preview">
                <strong>{preview.subject}</strong>
                <pre>{preview.text}</pre>
              </article>
            )}
          </section>
        </>
      )}
      <section>
        <h3>{e("jobs")}</h3>
        <p>{e("receipt")}</p>
        {!status?.jobs.length && <p>{e("empty")}</p>}
        {status?.jobs.map((j: any) => (
          <div className="connector-job" key={j.id}>
            <strong>{e(j.result?.outcome ?? j.state)}</strong>
            <small>
              {j.result?.provider ?? ""} · {j.id}
            </small>
          </div>
        ))}
      </section>
    </div>
  );
}
