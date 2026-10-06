/** Guided channel creation/editing reuses the native revisioned API and shared content-language inheritance. */
import AutomationDelete from "../automation/AutomationDelete";
import { useLifecycleText } from "../automation/lifecycle-i18n";
import { useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import type { Category } from "../catalog/catalog-model";
import { channelUrl, type Channel } from "./channel-model";
import { useChannelText } from "./channel-i18n";
import { ContentLanguage } from "../../shared/i18n/ContentLanguage";
import ContentLanguagePicker from "../../shared/i18n/ContentLanguagePicker";
import LocalizedField from "../../shared/i18n/LocalizedField";
import { contentText } from "../../shared/i18n/content-language";
import { useLocale } from "../../shared/i18n/i18n";
import ConfirmDialog from "../../shared/ui/ConfirmDialog";
import EntityHistory from "../../shared/history/EntityHistory";
import ChannelProducts from "./ChannelProducts";
import ChannelSettings from "./ChannelSettings";
export default function ChannelEditor({
  initial,
  request,
  languages,
  mainLocale,
  categories,
  workspace,
  canWrite,
  onBack,
  onSaved,
  onDeleted,
}: {
  initial: Channel;
  request: RequestFn;
  languages: string[];
  mainLocale: string;
  categories: Category[];
  workspace: string;
  canWrite: boolean;
  onBack: () => void;
  onSaved: (channel: Channel) => void;
  onDeleted?: () => void;
}) {
  const life = useLifecycleText();
  const t = useChannelText(),
    { locale } = useLocale();
  const [draft, setDraft] = useState(initial),
    [baseline, setBaseline] = useState(JSON.stringify(initial)),
    [step, setStep] = useState(0),
    [selected, setSelected] = useState(initial.data.productIds.length > 0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(false),
    [scope, setScope] = useState(false),
    [scopeDirty, setScopeDirty] = useState(false),
    [confirm, setConfirm] = useState<"back" | "active" | null>(null);
  const confirmKey =
    confirm === "back"
      ? "discard"
      : draft.data.active
        ? "deactivate"
        : "activate";
  const dirty = JSON.stringify(draft) !== baseline || scopeDirty;
  const patch = (v: Partial<Channel["data"]>) => {
    setNotice(false);
    setDraft({ ...draft, data: { ...draft.data, ...v } });
  };
  const valid =
    !!contentText(draft.data.name, mainLocale, mainLocale).trim() &&
    draft.data.locales.length > 0 &&
    (!selected || draft.data.productIds.length > 0);
  const save = async (next = draft) => {
    setBusy(true);
    setError("");
    try {
      const result = await request(
        `/api/automation/channels/${encodeURIComponent(next.id)}`,
        { revision: next.revision, data: next.data },
        "PUT",
      );
      const saved = { ...next, revision: result.revision };
      setDraft(saved);
      setBaseline(JSON.stringify(saved));
      setNotice(true);
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ContentLanguage locales={languages} mainLocale={mainLocale}>
      <section className="studio-card channel-editor">
        <header className="channel-editor-heading">
          <button
            className="studio-secondary"
            disabled={busy}
            onClick={() => (dirty ? setConfirm("back") : onBack())}
          >
            ← {t("back")}
          </button>
          <div>
            <h2>
              {contentText(draft.data.name, locale, mainLocale) || t("new")}
            </h2>
            <code>{draft.id}</code>
          </div>
          <ContentLanguagePicker />
        </header>
        {draft.revision > 0 && (
          <nav className="workbench-row">
            <button
              className={!scope ? "studio-primary" : "studio-secondary"}
              disabled={scopeDirty}
              onClick={() => setScope(false)}
            >
              {t("basics")}
            </button>
            <button
              className={scope ? "studio-primary" : "studio-secondary"}
              disabled={
                draft.id === "default" ||
                busy ||
                JSON.stringify(draft) !== baseline
              }
              onClick={() => setScope(true)}
            >
              {t("scope")}
            </button>
            <a
              className="studio-secondary"
              href={channelUrl(workspace, draft.id)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("preview")} ↗
            </a>
            <button
              className="studio-secondary"
              disabled={draft.id === "default" || !canWrite || dirty || busy}
              onClick={() => setConfirm("active")}
            >
              {t(draft.data.active ? "deactivate" : "activate")}
            </button>
          </nav>
        )}
        {scope ? (
          <ChannelSettings
            request={request}
            channel={draft.id}
            canWrite={canWrite}
            onDirty={setScopeDirty}
          />
        ) : (
          <>
            {!draft.revision && (
              <ol className="channel-steps">
                {(["basics", "catalog", "review"] as const).map((k, i) => (
                  <li key={k} aria-current={step === i ? "step" : undefined}>
                    {i + 1}. {t(k)}
                  </li>
                ))}
              </ol>
            )}
            <fieldset disabled={!canWrite || busy}>
              {(draft.revision > 0 || step === 0) && (
                <>
                  <LocalizedField
                    label={t("name")}
                    value={draft.data.name}
                    onChange={(name) =>
                      patch({ name: name as Record<string, string> })
                    }
                    required
                    maxLength={100}
                  />
                  <div
                    className="channel-kind-grid"
                    role="group"
                    aria-label={t("type")}
                  >
                    {(["storefront", "headless"] as const).map((kind) => (
                      <button
                        type="button"
                        key={kind}
                        className="channel-kind"
                        disabled={
                          draft.id === "default" && kind !== "storefront"
                        }
                        aria-pressed={draft.data.kind === kind}
                        onClick={() => patch({ kind })}
                      >
                        <strong>{t(kind)}</strong>
                        <p>
                          {t(
                            kind === "storefront"
                              ? "storefrontHint"
                              : "headlessHint",
                          )}
                        </p>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {(draft.revision > 0 || step === 1) && (
                <>
                  <h3>{t("languages")}</h3>
                  <div className="workbench-row">
                    {languages.map((language) => (
                      <button
                        type="button"
                        key={language}
                        disabled={draft.id === "default"}
                        aria-pressed={draft.data.locales.includes(language)}
                        className={
                          draft.data.locales.includes(language)
                            ? "studio-primary"
                            : "studio-secondary"
                        }
                        onClick={() =>
                          patch({
                            locales: draft.data.locales.includes(language)
                              ? draft.data.locales.filter((l) => l !== language)
                              : [...draft.data.locales, language],
                          })
                        }
                      >
                        {new Intl.DisplayNames([locale], {
                          type: "language",
                        }).of(language) ?? language}
                      </button>
                    ))}
                  </div>
                  <label>
                    {t("root")}
                    <select
                      value={draft.data.navigationCategoryId ?? ""}
                      onChange={(e) =>
                        patch({ navigationCategoryId: e.target.value || null })
                      }
                    >
                      <option value="">{t("all")}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {contentText(
                            Object.fromEntries(
                              Object.entries(c.data.translations).map(
                                ([l, v]) => [l, v.name],
                              ),
                            ),
                            locale,
                            mainLocale,
                          ) || c.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="workbench-row">
                    {[false, true].map((value) => (
                      <button
                        type="button"
                        key={String(value)}
                        className={
                          selected === value
                            ? "studio-primary"
                            : "studio-secondary"
                        }
                        onClick={() => {
                          setSelected(value);
                          if (!value) patch({ productIds: [] });
                        }}
                      >
                        {t(value ? "selected" : "all")}
                      </button>
                    ))}
                  </div>
                  {selected && (
                    <ChannelProducts
                      request={request}
                      value={draft.data.productIds}
                      onChange={(productIds) => patch({ productIds })}
                    />
                  )}
                </>
              )}
              {!draft.revision && step === 2 && (
                <div className="channel-review">
                  <strong>
                    {contentText(draft.data.name, locale, mainLocale)}
                  </strong>
                  <p>
                    {t(draft.data.kind)} · {draft.data.locales.join(" · ")}
                  </p>
                  <p>
                    {draft.data.productIds.length
                      ? `${t("selected")}: ${draft.data.productIds.length}`
                      : t("all")}
                  </p>
                  <p>{t("scopeHint")}</p>
                </div>
              )}
              <footer className="workbench-row">
                {!draft.revision && step > 0 && (
                  <button
                    type="button"
                    className="studio-secondary"
                    onClick={() => setStep(step - 1)}
                  >
                    {t("back")}
                  </button>
                )}
                {!draft.revision && step < 2 ? (
                  <button
                    type="button"
                    className="studio-primary"
                    onClick={() => {
                      if (
                        (step === 0 &&
                          !contentText(
                            draft.data.name,
                            mainLocale,
                            mainLocale,
                          ).trim()) ||
                        (step === 1 && !valid)
                      ) {
                        setError(t("invalid"));
                        return;
                      }
                      setError("");
                      setStep(step + 1);
                    }}
                  >
                    {t("next")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="studio-primary"
                    disabled={!valid || (!dirty && draft.revision > 0)}
                    onClick={() => void save()}
                  >
                    {t(draft.revision ? "save" : "new")}
                  </button>
                )}
              </footer>
            </fieldset>
            {draft.revision > 0 && (
              <EntityHistory
                request={request}
                entity="channel"
                id={draft.id}
                revision={draft.revision}
                dirty={dirty || busy}
                onRestored={async () => {
                  const value = (
                    await request("/api/automation")
                  ).channels.find((c: Channel) => c.id === draft.id);
                  if (value) {
                    setDraft(value);
                    setBaseline(JSON.stringify(value));
                    onSaved(value);
                  }
                }}
              />
            )}
          </>
        )}
        {draft.id === "default" && <p>{life("inheritLanguages")}</p>}
        <AutomationDelete
          request={request}
          kind="channels"
          id={draft.id}
          revision={draft.revision}
          disabled={!canWrite || dirty || busy}
          onDeleted={onDeleted ?? onBack}
        />
        {notice && <p role="status">{t("saved")}</p>}
        {error && <p role="alert">{error}</p>}
        {confirm && (
          <ConfirmDialog
            title={t(confirmKey)}
            confirmLabel={t(confirmKey)}
            disabled={busy}
            onCancel={() => setConfirm(null)}
            onConfirm={() => {
              if (confirm === "back") onBack();
              else
                void save({
                  ...draft,
                  data: { ...draft.data, active: !draft.data.active },
                });
              setConfirm(null);
            }}
          >
            <p>{t(confirm === "back" ? "discard" : "deactivateHint")}</p>
          </ConfirmDialog>
        )}
      </section>
    </ContentLanguage>
  );
}
