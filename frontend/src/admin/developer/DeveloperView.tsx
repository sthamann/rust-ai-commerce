/** Visual App Studio orchestrates modular editors over the same executable schema used by coding agents. */
import { useMemo, useState } from "react";
import type { Environment } from "../environments/EnvironmentManager";
import type { RequestFn } from "../shell/studio-types";
import Icon from "../../shared/ui/Icon";
import { ContentLanguage } from "../../shared/i18n/ContentLanguage";
import ContentLanguagePicker from "../../shared/i18n/ContentLanguagePicker";
import {
  useAppStudioText,
  appText,
  type AppStudioKey,
} from "../../shared/i18n/app-studio-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import { contentText } from "../../shared/i18n/content-language";
import { useAppStudio } from "./useAppStudio";
import { nextId, problems } from "./app-model";
import AppCanvas from "./AppCanvas";
import AppInspector from "./AppInspector";
import AppDataEditor from "./AppDataEditor";
import AppConnections from "./AppConnections";
import AppAgentPanel from "./AppAgentPanel";
import AppVersions from "./AppVersions";
import SandboxPreview from "./SandboxPreview";
import "../styles/app-studio.css";
import "../styles/app-studio-inspector.css";
import "../styles/app-studio-panels.css";
import "../styles/app-studio-responsive.css";
export default function DeveloperView({
  request,
  environments,
  role,
  sandboxRequest,
  onRefresh,
  onFlows,
}: {
  request: RequestFn;
  environments: Environment[];
  role: string;
  sandboxRequest: (environment: string) => RequestFn;
  onRefresh: () => Promise<void>;
  onFlows: () => void;
}) {
  const { a, locale } = useAppStudioText(),
    { w } = useWorkbenchText();
  const studio = useAppStudio(request, environments[0]?.id ?? "", onRefresh),
    m = studio.manifest;
  const [section, setSection] = useState<AppStudioKey>("design"),
    [viewId, setViewId] = useState("workspace"),
    [selected, setSelected] = useState(""),
    [preview, setPreview] = useState(false),
    [stageName, setStageName] = useState("");
  const [previewLanguages, setPreviewLanguages] = useState<{
    mainLocale: string;
    locales: string[];
  } | null>(null);
  const scoped = useMemo(
    () => sandboxRequest(studio.env),
    [sandboxRequest, studio.env],
  );
  const view = m.views?.find((v) => v.id === viewId) ?? m.views?.[0];
  const manage = ["owner", "admin"].includes(role);
  const canPreview =
    !!studio.saved &&
    studio.saved.state === "staged" &&
    !studio.dirty &&
    studio.env === studio.saved.environment;
  const tabs = ["design", "data", "connect", "agent", "versions"] as const;
  return (
    <div className="studio-page app-studio">
      <div className="app-studio-intro">
        <div>
          <span className="kicker">
            <Icon name="code" size={14} />
            {a("studio")}
          </span>
          <h1>{a("studio")}</h1>
          <p>{a("hint")}</p>
        </div>
        <button
          className="studio-secondary"
          disabled={!manage || studio.busy}
          onClick={() => {
            studio.reset();
            setPreview(false);
            setSelected("");
            setSection("design");
          }}
        >
          <Icon name="plus" size={16} />
          {a("reset")}
        </button>
      </div>
      <fieldset
        className="app-studio-fieldset"
        disabled={!manage || studio.busy}
      >
        <div className="app-studio-toolbar">
          <div className="app-current">
            <span className="app-logo">
              <Icon name="layers" size={20} />
            </span>
            <div>
              <strong>
                {contentText(m.name, locale, studio.mainLocale) || m.id}
              </strong>
              <small>
                {m.id} · {m.version} · {a(studio.dirty ? "dirty" : "saved")}
              </small>
            </div>
          </div>
          <div className="app-toolbar-actions">
            <label>
              {a("sandbox")}
              <select
                value={studio.env}
                onChange={(e) => {
                  studio.setEnv(e.target.value);
                  setPreview(false);
                }}
              >
                <option value="">{w("chooseStage")}</option>
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="studio-primary"
              disabled={!studio.env || problems(m) || !studio.dirty}
              onClick={() => void studio.run(studio.importVersion)}
            >
              <Icon name="check" size={16} />
              {a("saveVersion")}
            </button>
          </div>
        </div>
        {!environments.length && (
          <form
            className="app-new-sandbox"
            onSubmit={(e) => {
              e.preventDefault();
              void studio.run(() => studio.createSandbox(stageName));
            }}
          >
            <label>
              {w("stageName")}
              <input
                required
                maxLength={80}
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
              />
            </label>
            <button className="studio-secondary">{w("newStage")}</button>
          </form>
        )}
        <nav className="app-studio-tabs" aria-label={a("studio")}>
          {tabs.map((key) => (
            <button
              key={key}
              aria-current={section === key ? "page" : undefined}
              className={section === key ? "active" : ""}
              onClick={() => setSection(key)}
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
              {key === "versions" && <span>{studio.builds.length}</span>}
            </button>
          ))}
          <span className="app-tabs-caption">{a("pending")}</span>
        </nav>
        <ContentLanguage
          locales={
            preview && canPreview && previewLanguages
              ? previewLanguages.locales
              : studio.locales
          }
          mainLocale={
            preview && canPreview && previewLanguages
              ? previewLanguages.mainLocale
              : studio.mainLocale
          }
        >
          <div className="app-language-toolbar">
            <ContentLanguagePicker />
            {section === "design" && (
              <div className="app-canvas-actions">
                <button
                  className="app-icon-button"
                  disabled={!studio.history.past.length}
                  aria-label={a("undo")}
                  onClick={() => studio.dispatch("undo")}
                >
                  ↶
                </button>
                <button
                  className="app-icon-button"
                  disabled={!studio.history.future.length}
                  aria-label={a("redo")}
                  onClick={() => studio.dispatch("redo")}
                >
                  ↷
                </button>
                <button
                  className="studio-secondary"
                  disabled={!canPreview}
                  aria-pressed={preview && canPreview}
                  onClick={() => setPreview(!preview)}
                >
                  {a(preview && canPreview ? "design" : "realPreview")}
                </button>
              </div>
            )}
          </div>
          {section === "design" && (
            <>
              <div className="app-view-tabs">
                {m.views?.map((v) => (
                  <button
                    className={view?.id === v.id ? "active" : ""}
                    key={v.id}
                    onClick={() => {
                      setViewId(v.id);
                      setSelected("");
                    }}
                  >
                    {contentText(
                      m.surfaces?.find((s) => s.uiPath === `native/${v.id}`)
                        ?.label ?? {},
                      locale,
                      studio.mainLocale,
                    ) || v.id}
                  </button>
                ))}
                <button
                  disabled={(m.views?.length ?? 0) >= 16}
                  onClick={() => {
                    const id = nextId("view", m.views?.map((v) => v.id) ?? []);
                    studio.edit({
                      ...m,
                      views: [
                        ...(m.views ?? []),
                        { id, layout: "stack", blocks: [] },
                      ],
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
                    setViewId(id);
                  }}
                >
                  <Icon name="plus" size={15} />
                  {a("addView")}
                </button>
              </div>
              {view ? (
                <div className="app-editor-workspace">
                  {preview && canPreview ? (
                    <SandboxPreview
                      app={m.id}
                      version={m.version}
                      view={
                        m.surfaces?.find(
                          (s) => s.uiPath === `native/${view.id}`,
                        )?.id ?? view.id
                      }
                      request={scoped}
                      onLanguages={(mainLocale, locales) =>
                        setPreviewLanguages({ mainLocale, locales })
                      }
                    />
                  ) : (
                    <AppCanvas
                      manifest={m}
                      view={view}
                      selected={selected}
                      onSelect={setSelected}
                      onChange={studio.edit}
                      mainLocale={studio.mainLocale}
                      preview={false}
                      previewRequest={scoped}
                    />
                  )}
                  <AppInspector
                    manifest={m}
                    view={view}
                    selected={selected}
                    onChange={studio.edit}
                  />
                </div>
              ) : (
                <p>{a("select")}</p>
              )}
            </>
          )}
          {section === "data" && (
            <AppDataEditor manifest={m} onChange={studio.edit} />
          )}{" "}
          {section === "connect" && (
            <AppConnections
              manifest={m}
              onChange={studio.edit}
              onFlows={onFlows}
            />
          )}{" "}
          {section === "agent" && (
            <AppAgentPanel studio={studio} request={request} />
          )}{" "}
          {section === "versions" && <AppVersions studio={studio} />}
        </ContentLanguage>
      </fieldset>
      {studio.busy && (
        <p className="app-notice" role="status">
          {a("loading")}
        </p>
      )}
      {problems(m) && <p role="alert">{a("invalid")}</p>}
      {studio.error && (
        <p className="app-error" role="alert">
          {studio.error}
        </p>
      )}
      {studio.notice && (
        <p className="app-notice" role="status">
          {studio.notice === "released" ? w("released") : a("saved")}
        </p>
      )}
    </div>
  );
}
