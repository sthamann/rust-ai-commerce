/** Consistent navigation between visual definitions, provider contracts and immutable versions. */
import Icon from "../../shared/ui/Icon";
import {
  useAppStudioText,
  type AppStudioKey,
} from "../../shared/i18n/app-studio-i18n";
export default function AppEditorNavigation({
  section,
  onSelect,
  versions,
}: {
  section: AppStudioKey;
  onSelect: (s: AppStudioKey) => void;
  versions: number;
}) {
  const { a } = useAppStudioText();
  const tabs = [
    "design",
    "data",
    "connect",
    "payments",
    "agent",
    "versions",
  ] as const;
  return (
    <nav className="app-studio-tabs" aria-label={a("studio")}>
      {tabs.map((key) => (
        <button
          key={key}
          aria-current={section === key ? "page" : undefined}
          className={section === key ? "active" : ""}
          onClick={() => onSelect(key)}
        >
          <Icon
            name={
              key === "design"
                ? "layers"
                : key === "data"
                  ? "box"
                  : key === "connect"
                    ? "graph"
                    : key === "agent"
                      ? "spark"
                      : "truck"
            }
            size={17}
          />
          {a(key)}
          {key === "versions" && <span>{versions}</span>}
        </button>
      ))}
      <span className="app-tabs-caption">{a("pending")}</span>
    </nav>
  );
}
