/** StudioSidebar: focused Studio view; state and commands come from the session-scoped controller. */
import { AdminAppNavigation } from "../../shared/apps/AppSurfaces";
import "../../shared/styles/workbench.css";
import Icon from "../../shared/ui/Icon";
import "../styles/operations.css";
import "../styles/studio.css";

import { useStudio } from "./StudioContext";
import type { Tab } from "./navigation";
import { useStudioText } from "../../shared/i18n/studio-ui-i18n";

export default function StudioSidebar() {
  const {
    menu,
    t,
    selectTab,
    workspaceName,
    busy,
    newChat,
    nav,
    id,
    access,
    appSurface,
    tab,
    setMenu,
    tabLabel,
    data,
    setAppSurface,
    conversations,
    connected,
    run,
    load,
    onExit,
  } = useStudio();
  const { u } = useStudioText();
  const groups: { label: string; tabs: Tab[] }[] = [
    {
      label: u("intelligence"),
      tabs: ["assistant", "overview", "knowledge", "agents"],
    },
    { label: u("commerce"), tabs: ["productData", "orders", "customers"] },
    { label: u("experiences"), tabs: ["storyfronts", "automation", "apps"] },
    {
      label: u("workspace"),
      tabs: ["developers", "environments", "users", "commerce"],
    },
  ];
  return (
    <aside className={`studio-sidebar ${menu ? "open" : ""}`}>
      <a className="studio-brand" href="#merchant">
        <span className="brand-mark">
          <Icon name="spark" size={21} />
        </span>
        <span>
          commerce<span className="brand-subtitle">{t("studio")}</span>
        </span>
      </a>
      <button className="workspace-switch" onClick={() => selectTab("users")}>
        <span className="shop-monogram">
          {workspaceName.slice(0, 1).toUpperCase()}
        </span>
        <span>
          {workspaceName}
          <small>{t("demo")}</small>
        </span>
        <Icon name="settings" size={16} />
      </button>
      <button
        className="studio-primary new-conversation"
        disabled={busy}
        onClick={newChat}
      >
        <Icon name="plus" size={18} />
        {t("newChat")}
      </button>
      <nav aria-label={t("studio")}>
        {groups.map((group) => (
          <div className="sidebar-nav-group" key={group.label}>
            <span className="sidebar-group-label">{group.label}</span>
            {group.tabs
              .map((id) => nav.find((n) => n.id === id)!)
              .filter((n) =>
                n.id === "customers"
                  ? access.includes("customers.read")
                  : n.id === "orders"
                    ? access.includes("orders.read")
                    : n.id === "productData"
                      ? access.includes("catalog.write")
                      : true,
              )
              .map((n) => (
                <button
                  key={n.id}
                  aria-current={
                    !appSurface && tab === n.id ? "page" : undefined
                  }
                  className={!appSurface && tab === n.id ? "active" : ""}
                  onClick={() => {
                    selectTab(n.id);
                    setMenu(false);
                  }}
                >
                  <Icon name={n.icon} />
                  <span>{tabLabel(n.id)}</span>
                  {n.id === "overview" && data?.summary.ordersToday ? (
                    <b>{data.summary.ordersToday}</b>
                  ) : null}
                </button>
              ))}
          </div>
        ))}
        <AdminAppNavigation
          selected={appSurface}
          onSelect={(s) => {
            setAppSurface(s);
            setMenu(false);
          }}
        />
      </nav>
      <div className="sidebar-conversations">
        <span className="section-label">{t("conversations")}</span>
        {conversations.length ? (
          conversations.map((c) => (
            <button
              key={c.id}
              disabled={busy || !connected}
              title={c.title}
              className={id === c.id ? "selected" : ""}
              onClick={() => run(() => load(c.id))}
            >
              <Icon name="chat" size={15} />
              <span>{c.title}</span>
            </button>
          ))
        ) : (
          <p>{t("conversationEmpty")}</p>
        )}
      </div>
      <div className="sidebar-bottom">
        <button onClick={onExit}>
          <Icon name="arrow" />
          {t("storefront")}
        </button>
        <a
          href="https://github.com/sthamann/rust-ai-commerce"
          target="_blank"
          rel="noreferrer"
        >
          {t("source")}
          <span>v0.5</span>
        </a>
      </div>
    </aside>
  );
}
