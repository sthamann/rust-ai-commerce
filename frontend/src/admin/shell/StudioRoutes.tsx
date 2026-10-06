/** StudioRoutes: focused Studio view; state and commands come from the session-scoped controller. */
import { lazy, useCallback } from "react";
import { createStudioRequest } from "./requests";
import { useLocale } from "../../shared/i18n/i18n";
import StudioConversation from "./StudioConversation";

import { AppSurfaceView } from "../../shared/apps/AppSurfaces";
import "../../shared/styles/workbench.css";
import Icon from "../../shared/ui/Icon";
const AppsManager = lazy(() => import("../apps/AppsManager"));
const SalesChannelsWorkspace = lazy(
  () => import("../channels/SalesChannelsWorkspace"),
);
const AutomationView = lazy(() => import("../automation/AutomationView"));
const ProductDataView = lazy(() => import("../catalog/ProductDataView"));
const CustomersManager = lazy(() => import("../customers/CustomersManager"));
const DeveloperView = lazy(() => import("../developer/DeveloperWorkspace"));
const EnvironmentManager = lazy(
  () => import("../environments/EnvironmentManager"),
);
const OrdersManager = lazy(() => import("../orders/OrdersManager"));
const SettingsWorkspace = lazy(() => import("../settings/SettingsWorkspace"));
const StoryfrontView = lazy(() => import("../storyfronts/StoryfrontView"));
import "../styles/operations.css";
import "../styles/studio.css";
const AccessManager = lazy(() => import("../team/AccessManager"));
import type { Session } from "../team/UsersManager";
const UsersManager = lazy(() => import("../team/UsersManager"));
const AgentsView = lazy(() =>
  import("../agents/AgentsView").then((m) => ({ default: m.AgentsView })),
);
const KnowledgeView = lazy(() =>
  import("../intelligence/KnowledgeView").then((m) => ({
    default: m.KnowledgeView,
  })),
);
const OverviewView = lazy(() =>
  import("../dashboard/OverviewView").then((m) => ({
    default: m.OverviewView,
  })),
);

import { useStudio } from "./StudioContext";

export default function StudioRoutes() {
  const {
    appSurface,
    tab,
    request,
    token,
    environment,
    workspace,
    role,
    liveRequest,
    environments,
    refreshEnvironments,
    setEnvironment,
    setToken,
    setWorkspace,
    setWorkspaceName,
    setMessages,
    setId,
    setData,
    setConnected,
    setConversations,
    connected,
    data,
    access,
    setSettings,
    selectTab,
    entityTarget,
    openEntity,
    entityBack,
    intent,
    onProduct,
    setPreviewOpen,
    focus,
    onExit,
    nav,
    tabLabel,
    t,
    x,
  } = useStudio();
  const { locale } = useLocale();
  const sandboxRequest = useCallback(
    (id: string) => createStudioRequest(token, id, locale),
    [token, locale],
  );
  return appSurface ? (
    <AppSurfaceView selected={appSurface} />
  ) : tab === "orders" ? (
    <OrdersManager
      initialId={entityTarget?.tab === "orders" ? entityTarget.id : undefined}
      onEntity={openEntity}
      onEntityBack={entityTarget ? entityBack : undefined}
      request={request}
      headers={{
        Authorization: `Bearer ${token}`,
        "x-tenant": environment || workspace,
      }}
    />
  ) : tab === "customers" ? (
    <CustomersManager
      request={request}
      initialEmail={
        entityTarget?.tab === "customers" ? entityTarget.id : undefined
      }
      onEntity={openEntity}
      onEntityBack={entityTarget ? entityBack : undefined}
    />
  ) : tab === "automation" ? (
    <AutomationView
      request={request}
      role={role}
      onChannels={() => selectTab("channels")}
    />
  ) : tab === "channels" ? (
    <SalesChannelsWorkspace
      request={request}
      workspace={environment || workspace}
      onTeam={() => selectTab("users")}
    />
  ) : tab === "productData" ? (
    connected ? (
      <ProductDataView
        request={request}
        initialId={
          entityTarget?.tab === "productData" ? entityTarget.id : undefined
        }
        onEntityBack={entityTarget ? entityBack : undefined}
      />
    ) : (
      <div className="studio-empty">
        <p>{t("connectFirst")}</p>
        <button className="studio-primary" onClick={() => selectTab("users")}>
          {t("users")}
        </button>
      </div>
    )
  ) : tab === "storyfronts" ? (
    <StoryfrontView request={request} role={role} />
  ) : tab === "developers" ? (
    <DeveloperView
      key={workspace}
      workspace={workspace}
      sandboxRequest={sandboxRequest}
      onRefresh={refreshEnvironments}
      onFlows={() => selectTab("automation")}
      request={liveRequest}
      environments={environments}
      role={role}
    />
  ) : tab === "environments" ? (
    <EnvironmentManager
      request={liveRequest}
      environments={environments}
      onRefresh={refreshEnvironments}
      role={role}
      onSelect={setEnvironment}
    />
  ) : tab === "users" ? (
    <>
      <UsersManager
        token={token}
        workspace={workspace}
        onSession={(session: Session) => {
          if (session.token) {
            sessionStorage.setItem("rac-user-token", session.token);
            setToken(session.token);
          }
          sessionStorage.setItem("rac-user-workspace", session.workspace);
          setWorkspace(session.workspace);
          setWorkspaceName(
            session.workspaces.find((w) => w.id === session.workspace)?.name ??
              session.workspace,
          );
          history.replaceState(null, "", `?shop=${session.workspace}#merchant`);
        }}
        onWorkspace={(id, name) => {
          sessionStorage.setItem("rac-user-workspace", id);
          setWorkspace(id);
          setWorkspaceName(name);
          history.replaceState(null, "", `?shop=${id}#merchant`);
          setMessages([]);
          setId(undefined);
          setData(undefined);
        }}
        onLogout={() => {
          sessionStorage.removeItem("rac-user-token");
          sessionStorage.removeItem("rac-user-workspace");
          setToken("");
          setConnected(false);
          setData(undefined);
          setMessages([]);
          setConversations([]);
        }}
      />
      {connected && <AccessManager request={liveRequest} />}
    </>
  ) : tab === "assistant" ? (
    <StudioConversation />
  ) : data ? (
    tab === "apps" ? (
      <AppsManager
        key={environment || workspace}
        request={request}
        token={token}
        role={role}
      />
    ) : tab === "commerce" ? (
      <SettingsWorkspace
        request={request}
        rights={access}
        onConnections={() => setSettings(true)}
        onTeam={() => selectTab("users")}
        onAutomation={() => selectTab("automation")}
      />
    ) : tab === "overview" ? (
      <OverviewView
        data={data}
        onIntent={intent}
        onProduct={(id) => {
          onProduct(id);
          if (window.matchMedia("(max-width:1024px)").matches)
            setPreviewOpen(true);
        }}
      />
    ) : tab === "knowledge" ? (
      <KnowledgeView
        focus={focus}
        data={data}
        request={request}
        onIntent={intent}
        onProduct={(id) => {
          onProduct(id);
          setPreviewOpen(true);
        }}
      />
    ) : (
      <AgentsView data={data} onStorefront={onExit} />
    )
  ) : (
    <div className="studio-empty">
      <Icon name={nav.find((n) => n.id === tab)!.icon} size={48} />
      <h1>{tabLabel(tab)}</h1>
      <p>{t("connectFirst")}</p>
      <button className="studio-primary" onClick={() => selectTab("users")}>
        {x("studioSignIn")}
        <Icon name="link" size={18} />
      </button>
    </div>
  );
}
