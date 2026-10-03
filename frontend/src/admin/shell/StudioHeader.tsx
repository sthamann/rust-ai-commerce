/** StudioHeader: focused Studio view; state and commands come from the session-scoped controller. */
import { surfaceLabel } from "../../shared/apps/AppSurfaces";
import { locales } from "../../shared/i18n/i18n";
import "../../shared/styles/workbench.css";
import Icon from "../../shared/ui/Icon";
import "../styles/operations.css";
import "../styles/studio.css";

import { useStudio } from "./StudioContext";

export default function StudioHeader() {
  const {
    t,
    setMenu,
    menu,
    workspaceName,
    appSurface,
    locale,
    tabLabel,
    tab,
    connected,
    w,
    environment,
    setEnvironment,
    setId,
    setMessages,
    environments,
    setPreviewOpen,
    x,
    setLocale,
    setTheme,
    theme,
    busy,
    run,
    refresh,
    selectTab,
  } = useStudio();
  return (
    <header className="studio-topbar">
      <div>
        <button
          className="icon-button mobile-menu"
          aria-label={t("studio")}
          onClick={() => setMenu(!menu)}
        >
          <Icon name="menu" />
        </button>
        <span className="breadcrumb">
          {workspaceName} <span>/</span>{" "}
          <strong>
            {appSurface ? surfaceLabel(appSurface, locale) : tabLabel(tab)}
          </strong>
        </span>
      </div>
      <div className="topbar-actions">
        {connected && (
          <select
            className="environment-switch"
            aria-label={w("environments")}
            value={environment}
            onChange={(e) => {
              setEnvironment(e.target.value);
              setId(undefined);
              setMessages([]);
            }}
          >
            <option value="">{w("live")}</option>
            {environments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
        <button
          className="icon-button mobile-preview-button"
          aria-label={t("livePreview")}
          onClick={() => setPreviewOpen(true)}
        >
          <Icon name="box" />
        </button>
        <span className="connection-state">
          <i className={connected ? "on" : ""} />
          {connected ? t("connected") : x("studioSignedOut")}
        </span>
        <select
          aria-label={t("language")}
          value={locale}
          onChange={(e) => setLocale(e.target.value as typeof locale)}
        >
          {Object.entries(locales).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <button
          className="icon-button"
          aria-label={t("theme")}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
        <button
          className={connected ? "icon-button" : "studio-primary"}
          aria-label={connected ? t("refresh") : x("studioSignIn")}
          disabled={busy}
          onClick={() => (connected ? run(refresh) : selectTab("users"))}
        >
          {connected ? (
            <Icon name="refresh" size={18} />
          ) : (
            <>
              <Icon name="link" size={16} />
              <span>{x("studioSignIn")}</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
