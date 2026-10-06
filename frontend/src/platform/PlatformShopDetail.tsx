/** Connected shop dossier and reversible lifecycle controls; confirmations are explicit and revision guarded. */
import { useState } from "react";
import { useControlText } from "../shared/i18n/control-i18n";
import { usePlatformText } from "../shared/i18n/platform-i18n";
import { useCompanyText, type CompanyWord } from "../shared/i18n/company-i18n";
import { useLocale } from "../shared/i18n/i18n";
import {
  platformRequest as request,
  type ShopDetail,
  type Shop,
} from "./platform-api";
import { TrafficTable } from "./PlatformInfrastructure";
export default function PlatformShopDetail({
  data,
  token,
  onChanged,
}: {
  data: ShopDetail;
  token: string;
  onChanged: () => void;
}) {
  const { co } = useCompanyText();
  const c = useControlText(),
    t = usePlatformText(),
    { date, locale } = useLocale();
  const [action, setAction] = useState<Shop["status"]>(),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const change = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await request(token, `/api/platform/shops/${data.id}/status`, {
        status: action,
        revision: data.statusRevision,
        reason,
        confirmShopId: confirm,
      });
      setAction(undefined);
      setReason("");
      setConfirm("");
      onChanged();
    } catch {
      setError(t("retry"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="platform-panel">
        <div className="platform-shop-heading">
          <div>
            <h2>{data.name}</h2>
            <code>{data.id}</code>
          </div>
          <span className={`platform-status ${data.status}`}>
            {c(data.status)}
          </span>
        </div>
        <p>
          {t("created")}: {date(data.createdAt)}
        </p>
        <div className="platform-shop-stats">
          {(["products", "customers", "apps"] as const).map((k) => (
            <span key={k}>
              <b>{data.counts[k]}</b>
              {t(k)}
            </span>
          ))}
        </div>
        <div className="platform-actions">
          <a href={data.urls.storefrontUrl} target="_blank" rel="noreferrer">
            {t("open")} ↗
          </a>
          <a href={data.urls.studioUrl} target="_blank" rel="noreferrer">
            {t("studio")} ↗
          </a>
        </div>
        <p className="platform-note">{c("lifecycleHint")}</p>
        <div className="platform-actions">
          {data.status === "active" ? (
            <button onClick={() => setAction("paused")}>{c("pause")}</button>
          ) : (
            <button onClick={() => setAction("active")}>{c("restore")}</button>
          )}
          {data.status !== "archived" && (
            <button
              className="platform-danger"
              onClick={() => setAction("archived")}
            >
              {c("trash")}
            </button>
          )}
        </div>
        {action && (
          <form
            className="platform-lifecycle"
            onSubmit={(e) => {
              e.preventDefault();
              void change();
            }}
          >
            <h3>
              {c(
                action === "active"
                  ? "restore"
                  : action === "paused"
                    ? "pause"
                    : "trash",
              )}
            </h3>
            <label>
              {c("reason")}
              <input
                autoFocus
                required
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {action === "archived" && (
              <label>
                {c("confirmId")}
                <input
                  required
                  aria-label={c("confirmId")}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                <small>{data.id}</small>
              </label>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="platform-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setAction(undefined)}
              >
                {t("cancel")}
              </button>
              <button
                className="platform-primary"
                disabled={
                  busy || (action === "archived" && confirm !== data.id)
                }
              >
                {c("apply")}
              </button>
            </div>
          </form>
        )}
      </section>
      <section className="platform-panel">
        <h2>{c("business")}</h2>
        <dl>
          {Object.entries(data.business)
            .filter(([, v]) => typeof v === "string" && v)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{co(k as CompanyWord) ?? k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
        <h3>{t("team")}</h3>
        <div className="platform-table-scroll">
          <table>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.email}>
                  <td>{m.name}</td>
                  <td>{m.email}</td>
                  <td>{m.role}</td>
                  <td>{m.active ? c("active") : c("paused")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="platform-panel">
        <h2>{t("channels")}</h2>
        {data.salesChannels.map((s) => {
          const names = s.configuration.name as
            Record<string, string> | undefined;
          const label =
            names?.[locale] ??
            names?.["en-GB"] ??
            Object.values(names ?? {})[0] ??
            s.id;
          const url = new URL(data.urls.storefrontUrl);
          url.searchParams.set("channel", s.id);
          return (
            <article className="platform-channel-card" key={s.id}>
              <h3>{label}</h3>
              <span className="platform-status">
                {s.configuration.active ? c("active") : c("paused")}
              </span>
              <p>
                {s.id} · {String(s.configuration.kind ?? "")}
              </p>
              <a href={url.href} target="_blank" rel="noreferrer">
                {t("open")} ↗
              </a>
              <details>
                <summary>{c("channelConfiguration")}</summary>
                <pre>{JSON.stringify(s.configuration, null, 2)}</pre>
              </details>
            </article>
          );
        })}
      </section>
      <section className="platform-panel">
        <h2>{t("traffic")}</h2>
        <p className="platform-note">{t("trafficNote")}</p>
        <TrafficTable rows={data.traffic} />
      </section>
    </>
  );
}
