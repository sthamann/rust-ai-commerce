/** Core product tabs and installed app submenus share one accessible navigation. */
import { useLegalText } from "../../shared/i18n/legal-i18n";
import ContentLanguagePicker from "../../shared/i18n/ContentLanguagePicker";
import { useAppSurfaces, surfaceLabel } from "../../shared/apps/AppSurfaces";
import { useCatalogText } from "./catalog-i18n";
export default function ProductEditorNav({
  tabs,
  tab,
  id,
  onSelect,
}: {
  tabs: readonly string[];
  tab: string;
  id: string;
  onSelect: (t: string) => void;
}) {
  const { l } = useLegalText();
  const { c, locale } = useCatalogText();
  const appTabs = useAppSurfaces().filter(
    (s) => s.surface.location === "admin.product.tab",
  );
  return (
    <aside className="catalog-detail-nav">
      <ContentLanguagePicker />
      <div role="tablist" aria-orientation="vertical">
        {tabs.map((t) => (
          <button
            type="button"
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => onSelect(t)}
          >
            {t === "compliance"
              ? l("compliance")
              : c(t as Parameters<typeof c>[0])}
          </button>
        ))}
        {id &&
          appTabs.map((s) => {
            const key = `app:${s.app}:${s.surface.id}`;
            return (
              <button
                type="button"
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => onSelect(key)}
              >
                {surfaceLabel(s, locale)}
              </button>
            );
          })}
      </div>
    </aside>
  );
}
