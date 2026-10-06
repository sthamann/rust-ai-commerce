/** Discover and create channels separately from rules; shared settings and independent SaaS shops remain explicit. */
import { useEffect, useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import type { Category } from "../catalog/catalog-model";
import { useLocale } from "../../shared/i18n/i18n";
import { contentText } from "../../shared/i18n/content-language";
import { useChannelText } from "./channel-i18n";
import { freshChannel, type Channel } from "./channel-model";
import ChannelEditor from "./ChannelEditor";
import "../styles/sales-channels.css";
export default function SalesChannelsWorkspace({
  request,
  workspace,
  onTeam,
}: {
  request: RequestFn;
  workspace: string;
  onTeam: () => void;
}) {
  const t = useChannelText(),
    { locale } = useLocale();
  const [channels, setChannels] = useState<Channel[]>([]),
    [selected, setSelected] = useState<Channel | null>(null),
    [settings, setSettings] = useState<{
      locales: string[];
      mainLocale: string;
    }>(),
    [categories, setCategories] = useState<Category[]>([]),
    [manage, setManage] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      request("/api/automation"),
      request("/api/merchant/commerce"),
      request("/api/merchant/categories"),
      request("/api/auth/access"),
    ])
      .then(([a, c, k, p]) => {
        if (active) {
          setChannels(a.channels);
          setSettings(c.data);
          setCategories(k.elements);
          setManage(p.permissions.includes("settings.write"));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  const save = (channel: Channel) =>
    setChannels((old) => [...old.filter((c) => c.id !== channel.id), channel]);
  return (
    <div className="studio-page sales-channel-workspace">
      <div className="page-intro">
        <h1>{t("title")}</h1>
        <p>{t("hint")}</p>
        {!selected && (
          <button
            className="studio-primary"
            disabled={!settings || !manage}
            onClick={() => setSelected(freshChannel(settings!.mainLocale))}
          >
            + {t("new")}
          </button>
        )}
      </div>
      {selected && settings ? (
        <ChannelEditor
          key={selected.id}
          initial={selected}
          request={request}
          languages={settings.locales}
          mainLocale={settings.mainLocale}
          categories={categories}
          workspace={workspace}
          canWrite={manage}
          onBack={() => setSelected(null)}
          onSaved={save}
          onDeleted={() => {
            setChannels((old) => old.filter((c) => c.id !== selected.id));
            setSelected(null);
          }}
        />
      ) : (
        <>
          <div className="channel-card-grid">
            {channels.map((c) => (
              <article className="studio-card channel-card" key={c.id}>
                <span className="channel-avatar">
                  {c.data.kind === "headless" ? "API" : "V"}
                </span>
                <span className="soft-tag">
                  {t(c.data.active ? "active" : "inactive")}
                </span>
                {c.id === "default" && (
                  <span className="soft-tag">{t("default")}</span>
                )}
                <h2>
                  {contentText(
                    c.data.name,
                    locale,
                    settings?.mainLocale ?? "en-GB",
                  ) || c.id}
                </h2>
                <p>
                  {t(c.data.kind)} · {c.data.locales.length} ·{" "}
                  {c.data.productIds.length
                    ? `${t("selected")}: ${c.data.productIds.length}`
                    : t("all")}
                </p>
                <button
                  className="studio-secondary"
                  onClick={() => setSelected(c)}
                >
                  {t("edit")} ↗
                </button>
              </article>
            ))}
          </div>
          <aside className="studio-card">
            <p>{t("independent")}</p>
            <button className="studio-secondary" onClick={onTeam}>
              {t("team")} ↗
            </button>
          </aside>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
