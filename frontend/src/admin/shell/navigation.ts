/** Typed built-in Studio navigation and locale-specific labels. */
import { useLocale } from "../../shared/i18n/i18n";
import { useOperationsText } from "../../shared/i18n/operations-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import { type IconName } from "../../shared/ui/Icon";
export type Tab =
  | "assistant"
  | "overview"
  | "knowledge"
  | "agents"
  | "commerce"
  | "users"
  | "apps"
  | "storyfronts"
  | "developers"
  | "environments"
  | "automation"
  | "productData"
  | "orders"
  | "customers";

export function useStudioNavigation() {
  const { t } = useLocale();
  const { w } = useWorkbenchText();
  const { o } = useOperationsText();
  const tabLabel = (id: Tab) =>
    id === "commerce"
      ? t("settings")
      : id === "orders" || id === "customers"
        ? o(id)
        : [
              "storyfronts",
              "developers",
              "environments",
              "automation",
              "productData",
            ].includes(id)
          ? w(
              id as
                | "storyfronts"
                | "developers"
                | "environments"
                | "automation"
                | "productData",
            )
          : t(
              id as Exclude<
                Tab,
                | "storyfronts"
                | "developers"
                | "environments"
                | "automation"
                | "productData"
                | "orders"
                | "customers"
              >,
            );

  const nav: { id: Tab; icon: IconName }[] = [
    { id: "assistant", icon: "chat" },
    { id: "overview", icon: "pulse" },
    { id: "orders", icon: "box" },
    { id: "customers", icon: "agents" },
    { id: "knowledge", icon: "graph" },
    { id: "agents", icon: "agents" },
    { id: "commerce", icon: "box" },
    { id: "productData", icon: "box" },
    { id: "automation", icon: "pulse" },
    { id: "users", icon: "lock" },
    { id: "storyfronts", icon: "box" },
    { id: "developers", icon: "settings" },
    { id: "environments", icon: "box" },
    { id: "apps", icon: "plus" },
  ];

  return { tabLabel, nav };
}
