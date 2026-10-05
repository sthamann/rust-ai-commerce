/** Native view navigation and creation are separate from workspace orchestration. */
import type { Manifest } from "../../shared/apps/native/types";
import { useAppStudioText, appText } from "../../shared/i18n/app-studio-i18n";
import { contentText } from "../../shared/i18n/content-language";
import Icon from "../../shared/ui/Icon";
import { nextId } from "./app-model";
export default function AppViewTabs({
  manifest: m,
  selected,
  mainLocale,
  onSelect,
  onChange,
}: {
  manifest: Manifest;
  selected?: string;
  mainLocale: string;
  onSelect: (id: string) => void;
  onChange: (m: Manifest) => void;
}) {
  const { a, locale } = useAppStudioText();
  return (
    <div className="app-view-tabs">
      {m.views?.map((v) => (
        <button
          type="button"
          key={v.id}
          className={selected === v.id ? "active" : ""}
          onClick={() => onSelect(v.id)}
        >
          {contentText(
            m.surfaces?.find((s) => s.uiPath === `native/${v.id}`)?.label ?? {},
            locale,
            mainLocale,
          ) || v.id}
        </button>
      ))}
      <button
        type="button"
        disabled={(m.views?.length ?? 0) >= 16}
        onClick={() => {
          const id = nextId("view", m.views?.map((v) => v.id) ?? []);
          onChange({
            ...m,
            views: [...(m.views ?? []), { id, layout: "stack", blocks: [] }],
            surfaces: [
              ...(m.surfaces ?? []),
              {
                id,
                location: "admin.navigation",
                label: appText("admin"),
                uiPath: `native/${id}`,
                actions: [],
              },
            ],
          });
          onSelect(id);
        }}
      >
        <Icon name="plus" size={15} />
        {a("addView")}
      </button>
    </div>
  );
}
