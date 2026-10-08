/** Catalog/language controls share the channel schema and content-language fallback. */
import type { Channel } from "./channel-model";
import type { Category } from "../catalog/catalog-model";
import type { RequestFn } from "../shell/studio-types";
import { useChannelText } from "./channel-i18n";
import { useLocale } from "../../shared/i18n/i18n";
import { contentText } from "../../shared/i18n/content-language";
import ChannelProducts from "./ChannelProducts";
export default function ChannelCatalog({
  draft,
  languages,
  categories,
  mainLocale,
  selected,
  setSelected,
  patch,
  request,
}: {
  draft: Channel;
  languages: string[];
  categories: Category[];
  mainLocale: string;
  selected: boolean;
  setSelected: (v: boolean) => void;
  patch: (v: Partial<Channel["data"]>) => void;
  request: RequestFn;
}) {
  const t = useChannelText(),
    { locale } = useLocale();
  return (
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
                  Object.entries(c.data.translations).map(([l, v]) => [
                    l,
                    v.name,
                  ]),
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
              selected === value ? "studio-primary" : "studio-secondary"
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
  );
}
