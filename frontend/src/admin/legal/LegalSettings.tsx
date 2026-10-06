/** Central revisioned legal workspace, inherited channel settings, source-backed sector guidance and request review. */
import { useEffect, useState } from "react";
import { useLegalText } from "../../shared/i18n/legal-i18n";
import { ContentLanguage } from "../../shared/i18n/ContentLanguage";
import ContentLanguagePicker from "../../shared/i18n/ContentLanguagePicker";
import LocalizedField from "../../shared/i18n/LocalizedField";
import { contentText } from "../../shared/i18n/content-language";
import {
  documents,
  defaultLegal,
  sectors,
  type LegalConfig,
} from "../../shared/legal/legal-types";
import { requirements } from "../../shared/legal/requirements";
import type { Config } from "../../shared/api/shop-api";
import type { RequestFn } from "../shell/studio-types";
import { useSettingsDraft } from "../settings/useSettingsDraft";
import { useCompanyContext } from "../settings/useCompanyContext";
import SettingsSaveBar from "../settings/SettingsSaveBar";
import EntityHistory from "../../shared/history/EntityHistory";
import LegalServices from "./LegalServices";
import ConsumerRequests from "./ConsumerRequests";
import "../styles/legal-settings.css";
export default function LegalSettings({
  request,
  canWrite,
  onDirty,
  initialChannel = "",
  rights = [],
}: {
  request: RequestFn;
  canWrite: boolean;
  onDirty?: (v: boolean) => void;
  initialChannel?: string;
  rights?: string[];
}) {
  const { l, locale } = useLegalText();
  const [channel, setChannel] = useState(initialChannel),
    [tab, setTab] = useState<"overview" | "documents" | "consent" | "requests">(
      "overview",
    ),
    [language, setLanguage] = useState<string>();
  const state = useSettingsDraft<
      Config,
      { inherited?: Config; baseRevision?: number }
    >(
      request,
      channel
        ? `/api/merchant/commerce/channels/${channel}`
        : "/api/merchant/commerce",
    ),
    context = useCompanyContext(request);
  useEffect(() => onDirty?.(state.dirty), [state.dirty, onDirty]);
  if (!state.value)
    return <p role={state.error ? "alert" : "status"}>{state.error || "…"}</p>;
  const config = state.value.data,
    c = config.legal ?? defaultLegal(),
    main = config.mainLocale ?? "en-GB",
    locales = config.locales ?? [main],
    index =
      ({ en: 0, de: 1, fr: 2, es: 3 } as Record<string, number>)[
        locale.split("-")[0]
      ] ?? 0;
  const update = (patch: Partial<LegalConfig>) =>
    state.change({ ...config, legal: { ...c, ...patch } });
  return (
    <ContentLanguage
      locales={locales}
      mainLocale={main}
      language={language}
      onLanguageChange={setLanguage}
    >
      <section className="studio-card settings-panel legal-settings">
        <header className="settings-panel-header">
          <div>
            <h2>{l("title")}</h2>
            <p>{l("hint")}</p>
          </div>
          <ContentLanguagePicker />
        </header>
        <div className="legal-scope">
          <select
            aria-label={l("title")}
            disabled={state.dirty || state.busy}
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="">{l("sharedBasis")}</option>
            {context.channels
              .filter((c) => c.id !== "default")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {contentText(c.data.name, locale, main) || c.id}
                </option>
              ))}
          </select>
          {channel && (
            <button
              disabled={!canWrite || state.busy}
              className="studio-secondary"
              onClick={() =>
                state.value?.inherited &&
                state.change({
                  ...config,
                  legal: state.value.inherited.legal ?? defaultLegal(),
                })
              }
            >
              {l("inheritBasis")} ↗
            </button>
          )}
        </div>
        <nav className="legal-tabs">
          {(["overview", "documents", "consent", "requests"] as const)
            .filter(
              (k) => k !== "requests" || rights.includes("customers.read"),
            )
            .map((k) => (
              <button
                key={k}
                aria-pressed={k === tab}
                onClick={() => setTab(k)}
              >
                {l(k)}
              </button>
            ))}
        </nav>
        {state.error && <p role="alert">{state.error}</p>}
        {tab === "requests" ? (
          <ConsumerRequests
            request={request}
            canWrite={rights.includes("customers.write")}
          />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canWrite) void state.save();
            }}
          >
            <fieldset disabled={!canWrite || state.busy}>
              {tab === "overview" && (
                <>
                  <div className="legal-status">
                    <strong>{l("technical")}</strong>
                    <p>{l("noCertification")}</p>
                    <label className="legal-toggle">
                      <input
                        type="checkbox"
                        checked={c.strictCheckout}
                        onChange={(e) =>
                          update({ strictCheckout: e.target.checked })
                        }
                      />
                      {l("strict")}
                    </label>
                    <small>{l("strictHint")}</small>
                  </div>
                  <h3>{l("sectors")}</h3>
                  <div className="legal-sector-grid">
                    {sectors.map((s) => (
                      <button
                        type="button"
                        key={s}
                        aria-pressed={c.sectors.includes(s)}
                        onClick={() =>
                          update({
                            sectors: c.sectors.includes(s)
                              ? c.sectors.filter((v) => v !== s)
                              : [...c.sectors, s],
                          })
                        }
                      >
                        {l(s)}
                      </button>
                    ))}
                  </div>
                  <div className="legal-doc-status">
                    {documents.map((d) => (
                      <button
                        type="button"
                        key={d}
                        onClick={() => setTab("documents")}
                      >
                        <strong>{l(d)}</strong>
                        <small>
                          {l(
                            contentText(c.documents[d] ?? {}, main, main).trim()
                              ? "published"
                              : "missing",
                          )}
                        </small>
                      </button>
                    ))}
                  </div>
                  <h3>{l("operatorReview")}</h3>
                  <div className="legal-requirements">
                    {requirements
                      .filter(
                        (r) =>
                          !r.sectors.length ||
                          r.sectors.some((s) => c.sectors.includes(s)),
                      )
                      .map((r) => (
                        <details key={r.id}>
                          <summary>{r.text[index]}</summary>
                          <a href={r.source} target="_blank" rel="noreferrer">
                            {l("source")} ↗
                          </a>
                          <label>
                            {l("operatorNotes")}
                            <textarea
                              rows={3}
                              value={c.operatorNotes[r.id] ?? ""}
                              maxLength={8000}
                              onChange={(e) =>
                                update({
                                  operatorNotes: {
                                    ...c.operatorNotes,
                                    [r.id]: e.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                        </details>
                      ))}
                  </div>
                </>
              )}
              {tab === "documents" && (
                <div className="legal-documents">
                  {documents.map((d) => (
                    <LocalizedField
                      key={d}
                      label={l(d)}
                      value={c.documents[d] ?? {}}
                      multiline
                      maxLength={30000}
                      onChange={(map) =>
                        update({
                          documents: {
                            ...c.documents,
                            [d]: Object.fromEntries(
                              Object.entries(map).filter(([, v]) => v != null),
                            ) as Record<string, string>,
                          },
                        })
                      }
                    />
                  ))}
                </div>
              )}
              {tab === "consent" && <LegalServices c={c} update={update} />}
            </fieldset>
            <SettingsSaveBar {...state} canWrite={canWrite} />
          </form>
        )}
        <EntityHistory
          request={request}
          entity={channel ? "checkoutChannel" : "settings"}
          id={channel || "base"}
          revision={state.value.revision}
          dirty={state.dirty || state.busy}
          onRestored={state.reload}
        />
      </section>
    </ContentLanguage>
  );
}
