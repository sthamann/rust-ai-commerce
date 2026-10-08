/** Uses the existing tenant-owned frontend registry, not a parallel domain or Experience store. */
import { useEffect, useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import {
  connectionUrl,
  type FrontendConnection,
} from "../storyfronts/storyfront-model";
import type { Channel } from "./channel-model";
import { useConnectionText } from "./connection-i18n";
import { useLocale } from "../../shared/i18n/i18n";
import { contentText } from "../../shared/i18n/content-language";
import ConfirmDialog from "../../shared/ui/ConfirmDialog";
export default function ChannelConnections({
  request,
  channel,
  disabled,
  mainLocale = "en-GB",
}: {
  request: RequestFn;
  channel: string;
  disabled: boolean;
  mainLocale?: string;
}) {
  const t = useConnectionText(),
    { locale } = useLocale();
  const [rows, setRows] = useState<FrontendConnection[]>([]),
    [channels, setChannels] = useState<Channel[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(false),
    [remove, setRemove] = useState<FrontendConnection | null>(null),
    [alias, setAlias] = useState(""),
    [experience, setExperience] = useState("");
  const refresh = async () => {
    const [f, a] = await Promise.all([
      request("/api/settings/frontends"),
      request("/api/automation"),
    ]);
    setRows(f.frontends ?? []);
    setChannels(a.channels ?? []);
    setLoaded(true);
  };
  useEffect(() => {
    let active = true;
    Promise.all([
      request("/api/settings/frontends"),
      request("/api/automation"),
    ])
      .then(([f, a]) => {
        if (active) {
          setRows(f.frontends ?? []);
          setChannels(a.channels ?? []);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) setError(t("error"));
      });
    return () => {
      active = false;
    };
  }, [request, channel]);
  const save = async (
    data: object,
    method = "PUT",
    path = "/api/settings/frontends",
  ) => {
    setBusy(true);
    setError("");
    setNotice(false);
    try {
      await request(path, data, method);
      await refresh();
      setNotice(true);
      setAlias("");
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  };
  const experiences = [
    ...new Set(rows.map((f) => f.experienceAlias ?? f.alias)),
  ];
  return (
    <section className="channel-connections">
      <header>
        <h3>{t("title")}</h3>
        <p>{t("hint")}</p>
      </header>
      {!loaded && !error && <p role="status">{t("loading")}</p>}
      {loaded && !rows.some((f) => f.channel === channel) && (
        <p>{t("empty")}</p>
      )}
      {rows
        .filter((f) => f.channel === channel)
        .map((f) => (
          <article className="channel-domain-card" key={f.alias}>
            <div>
              <strong>
                {connectionUrl(f.url) ? new URL(f.url).hostname : f.alias}
              </strong>
              <p>
                {t("experience")}: {f.experienceAlias ?? f.alias}
              </p>
            </div>
            <div className="workbench-row">
              {connectionUrl(f.editorUrl, locale) && (
                <a
                  className="studio-primary"
                  href={connectionUrl(f.editorUrl, locale)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("edit")} ↗
                </a>
              )}
              {connectionUrl(f.url) && (
                <a
                  className="studio-secondary"
                  href={connectionUrl(f.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("open")} ↗
                </a>
              )}
            </div>
            <label>
              {t("channel")}
              <select
                value={f.channel}
                disabled={disabled || busy}
                onChange={(e) =>
                  void save({
                    alias: f.alias,
                    experienceAlias: f.experienceAlias ?? f.alias,
                    channel: e.target.value,
                    revision: f.revision,
                  })
                }
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {contentText(c.data.name, locale, mainLocale) || c.id}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="studio-secondary"
              disabled={disabled || busy}
              onClick={() => setRemove(f)}
            >
              {t("disconnect")}
            </button>
          </article>
        ))}
      {experiences.length > 0 && (
        <form
          className="channel-domain-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save({
              alias,
              experienceAlias: experience || experiences[0],
              channel,
              revision: 0,
            });
          }}
        >
          <h3>{t("add")}</h3>
          <label>
            {t("domain")}
            <input
              value={alias}
              onChange={(e) => setAlias(e.target.value.toLowerCase())}
              pattern="[a-z0-9][a-z0-9-]{0,46}[a-z0-9]"
              required
              disabled={disabled || busy}
            />
          </label>
          <label>
            {t("experience")}
            <select
              value={experience || experiences[0]}
              onChange={(e) => setExperience(e.target.value)}
              disabled={disabled || busy}
            >
              {experiences.map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </label>
          <button
            className="studio-primary"
            disabled={disabled || busy || !alias}
          >
            {t("save")}
          </button>
        </form>
      )}
      <p className="channel-status-hint">{t("hosting")}</p>
      {notice && <p role="status">{t("saved")}</p>}
      {error && <p role="alert">{error}</p>}
      {remove && (
        <ConfirmDialog
          title={t("disconnect")}
          confirmLabel={t("disconnect")}
          disabled={busy}
          onCancel={() => setRemove(null)}
          onConfirm={() => {
            void save(
              { revision: remove.revision },
              "DELETE",
              `/api/settings/frontends/${encodeURIComponent(remove.alias)}`,
            );
            setRemove(null);
          }}
        >
          <p>{t("disconnectHint")}</p>
          <strong>{remove.alias}</strong>
        </ConfirmDialog>
      )}
    </section>
  );
}
