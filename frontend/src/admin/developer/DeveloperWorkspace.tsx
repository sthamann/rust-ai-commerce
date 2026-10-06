/** Dedicated app and API workspaces retain App Studio state while switching the developer console. */
import { useState } from "react";
import type { ComponentProps } from "react";
import DeveloperView from "./DeveloperView";
import IntegrationKeys from "./api/IntegrationKeys";
import ApiExplorer from "./api/ApiExplorer";
import { useApiText } from "./api/api-i18n";
import "../styles/api-console.css";
export default function DeveloperWorkspace(
  props: ComponentProps<typeof DeveloperView> & { workspace: string },
) {
  const t = useApiText(),
    [tab, setTab] = useState<"studio" | "console">("studio");
  return (
    <>
      <nav className="developer-workspace-tabs workbench-row">
        {(["studio", "console"] as const).map((k) => (
          <button
            key={k}
            className={tab === k ? "studio-primary" : "studio-secondary"}
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
          >
            {t(k)}
          </button>
        ))}
      </nav>
      <div hidden={tab !== "studio"}>
        <DeveloperView {...props} />
      </div>
      {tab === "console" && (
        <div className="studio-page api-console">
          <div className="page-intro">
            <h1>{t("console")}</h1>
            <p>{t("intro")}</p>
          </div>
          <IntegrationKeys request={props.request} />
          <ApiExplorer request={props.request} workspace={props.workspace} />
        </div>
      )}
    </>
  );
}
