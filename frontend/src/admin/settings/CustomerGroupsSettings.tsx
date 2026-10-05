/** Customer groups share the translation/inheritance editor and revisioned settings aggregate. */
import { useEffect, useState } from "react";
import type { Config } from "../../shared/api/shop-api";
import type { CustomerGroup } from "../../shared/customer/customer-types";
import { inheritedText } from "../../shared/geography/geography-types";
import TranslationFields from "../../shared/geography/TranslationFields";
import { ContentLanguage } from "../../shared/i18n/ContentLanguage";
import ContentLanguagePicker from "../../shared/i18n/ContentLanguagePicker";
import { crmWords, useCrmText } from "../../shared/i18n/crm-i18n";
import EntityHistory from "../../shared/history/EntityHistory";
import ConfirmDialog from "../../shared/ui/ConfirmDialog";
import type { RequestFn } from "../shell/studio-types";
import SettingsSaveBar from "./SettingsSaveBar";
import { useSettingsDraft } from "./useSettingsDraft";
import "../styles/international.css";
export default function CustomerGroupsSettings({
  request,
  canWrite,
  onDirty,
}: {
  request: RequestFn;
  canWrite: boolean;
  onDirty?: (dirty: boolean) => void;
}) {
  const { r, locale } = useCrmText(),
    state = useSettingsDraft<Config>(request, "/api/merchant/commerce");
  const [selected, setSelected] = useState(""),
    [language, setLanguage] = useState<string>(),
    [removing, setRemoving] = useState(false);
  useEffect(() => onDirty?.(state.dirty), [state.dirty, onDirty]);
  if (!state.value)
    return (
      <p role={state.error ? "alert" : "status"}>
        {state.error || r("loading")}
      </p>
    );
  const config = state.value.data,
    groups = config.customerGroups ?? [],
    mainLocale = config.mainLocale ?? "en-GB",
    locales = config.locales ?? [mainLocale];
  const group = groups.find((g) => g.id === selected) ?? groups[0];
  const label = (g: CustomerGroup) =>
    inheritedText(g.translations, locale, mainLocale, "name") || g.id;
  const update = (g: CustomerGroup) =>
    state.change({
      ...config,
      customerGroups: groups.map((old) => (old.id === group.id ? g : old)),
    });
  return (
    <ContentLanguage
      locales={locales}
      mainLocale={mainLocale}
      language={language}
      onLanguageChange={setLanguage}
    >
      <section className="studio-card settings-panel intl-panel">
        <header className="settings-panel-header">
          <div>
            <h2>{r("groups")}</h2>
            <p>{r("groupsHint")}</p>
          </div>
          <ContentLanguagePicker />
        </header>
        {state.error && <p role="alert">{state.error}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canWrite) void state.save();
          }}
        >
          <fieldset className="intl-fields" disabled={!canWrite || state.busy}>
            <div className="intl-master-detail">
              <aside className="intl-record-list">
                {groups.map((g) => (
                  <button
                    type="button"
                    key={g.id}
                    aria-pressed={g.id === group?.id}
                    onClick={() => setSelected(g.id)}
                  >
                    <span>
                      <strong>{label(g)}</strong>
                      <small>{g.id}</small>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="studio-secondary"
                  onClick={() => {
                    const id = `group_${crypto.randomUUID().slice(0, 8)}`;
                    const translations = Object.fromEntries(
                      locales.map((l) => [
                        l,
                        {
                          name: crmWords.newGroup[
                            (
                              { en: 0, de: 1, fr: 2, es: 3 } as Record<
                                string,
                                number
                              >
                            )[l.split("-")[0]] ?? 0
                          ],
                        },
                      ]),
                    );
                    state.change({
                      ...config,
                      customerGroups: [
                        ...groups,
                        { id, priceBasis: "consumer", translations },
                      ],
                    });
                    setSelected(id);
                  }}
                >
                  + {r("addGroup")}
                </button>
              </aside>
              {group && (
                <div className="intl-record">
                  <h3>{label(group)}</h3>
                  <small>
                    {r("id")} · {group.id}
                  </small>
                  <TranslationFields
                    value={group.translations}
                    locales={locales}
                    mainLocale={mainLocale}
                    onChange={(translations) =>
                      update({ ...group, translations })
                    }
                  />
                  <label>
                    {r("priceBasis")}
                    <select
                      value={group.priceBasis}
                      disabled={["consumer", "business"].includes(group.id)}
                      onChange={(e) =>
                        update({
                          ...group,
                          priceBasis: e.target
                            .value as CustomerGroup["priceBasis"],
                        })
                      }
                    >
                      <option value="consumer">{r("consumer")}</option>
                      <option value="business">{r("business")}</option>
                    </select>
                  </label>
                  {["consumer", "business"].includes(group.id) ? (
                    <p>{r("baseGroup")}</p>
                  ) : (
                    <button
                      type="button"
                      className="studio-secondary"
                      onClick={() => setRemoving(true)}
                    >
                      {r("delete")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </fieldset>
          <SettingsSaveBar {...state} canWrite={canWrite} />
        </form>
        <EntityHistory
          request={request}
          entity="settings"
          id="base"
          revision={state.value.revision}
          dirty={state.dirty || state.busy}
          onRestored={state.reload}
        />
      </section>
      {removing && group && (
        <ConfirmDialog
          title={r("removeGroup")}
          confirmLabel={r("delete")}
          onCancel={() => setRemoving(false)}
          onConfirm={() => {
            state.change({
              ...config,
              customerGroups: groups.filter((g) => g.id !== group.id),
            });
            setSelected("");
            setRemoving(false);
          }}
        >
          <p>{label(group)}</p>
          <p>{r("dependencyHint")}</p>
        </ConfirmDialog>
      )}
    </ContentLanguage>
  );
}
