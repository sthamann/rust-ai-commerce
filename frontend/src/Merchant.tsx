import { responseError } from "./errors-i18n";
import SettingsDialog from "./SettingsDialog";
import ProposalCard from "./ProposalCard";
import PreviewDialog from "./PreviewDialog";
import MessageText from "./MessageText";
import UsersManager, { type Session } from "./UsersManager";
import AppsManager from "./AppsManager";
import AutomationView from "./AutomationView";
import OrdersManager from "./OrdersManager";
import CustomersManager from "./CustomersManager";
import AccessManager from "./AccessManager";
import { useOperationsText } from "./operations-i18n";
import "./operations.css";
import ProductDataView from "./ProductDataView";
import StoryfrontView from "./StoryfrontView";
import DeveloperView from "./DeveloperView";
import EnvironmentManager, { type Environment } from "./EnvironmentManager";
import { useWorkbenchText } from "./workbench-i18n";
import "./workbench.css";
import SettingsWorkspace from "./SettingsWorkspace";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "./Icon";
import { locales, useLocale } from "./i18n";
import type { Message, Overview, Provider, RequestFn } from "./studio-types";
import {
  AgentsView,
  KnowledgeView,
  OverviewView,
  PreviewPanel,
} from "./StudioViews";
import "./studio.css";
type Tab =
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
export default function Merchant({
  onChanged,
  onExit,
}: {
  onChanged: () => Promise<void>;
  onExit: () => void;
}) {
  const { locale, setLocale, t, date } = useLocale();
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
  const [access, setAccess] = useState<string[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [environment, setEnvironment] = useState("");
  const [token, setToken] = useState(
    () => sessionStorage.getItem("rac-user-token") ?? "",
  );
  const [workspace, setWorkspace] = useState(
    () =>
      new URLSearchParams(location.search).get("shop") ??
      sessionStorage.getItem("rac-user-workspace") ??
      "atelier",
  );
  useEffect(() => {
    if (token && !new URLSearchParams(location.search).has("shop"))
      history.replaceState(null, "", `?shop=${workspace}#merchant`);
  }, [token, workspace]);
  const [workspaceName, setWorkspaceName] = useState(workspace);
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState("viewer");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState("ollama");
  const [model, setModel] = useState("");
  const [conversations, setConversations] = useState<
    { id: string; title: string }[]
  >([]);
  const [id, setId] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{
    key: "indexed" | "approvedAction" | "copied";
    count?: number;
  }>();
  const [settings, setSettings] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("assistant");
  const [data, setData] = useState<Overview>();
  const [focus, setFocus] = useState("lamp");
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("rac-studio-theme-v03") || "light",
  );
  const [updated, setUpdated] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const liveRequest: RequestFn = useCallback(
    async (path, body, method) => {
      const r = await fetch(path, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: {
          ...(body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
          Authorization: `Bearer ${token}`,
          "x-tenant": workspace,
          "x-commerce-locale": locale,
        },
        body:
          body === undefined
            ? undefined
            : body instanceof FormData
              ? body
              : JSON.stringify(body),
      });
      const value = await r.json();
      if (!r.ok)
        throw responseError(
          value.errors?.[0]?.detail || r.statusText,
          r.status,
        );
      return value;
    },
    [token, locale, workspace],
  );
  const request: RequestFn = useCallback(
    async (path, body, method) => {
      if (!environment) return liveRequest(path, body, method);
      const r = await fetch(path, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: {
          ...(body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
          Authorization: `Bearer ${token}`,
          "x-tenant": environment,
          "x-commerce-locale": locale,
        },
        body:
          body === undefined
            ? undefined
            : body instanceof FormData
              ? body
              : JSON.stringify(body),
      });
      const value = await r.json();
      if (!r.ok)
        throw responseError(
          value.errors?.[0]?.detail || r.statusText,
          r.status,
        );
      return value;
    },
    [liveRequest, environment, token, locale],
  );
  useEffect(() => {
    if (token)
      void request("/api/auth/access")
        .then((v) => setAccess(v.permissions))
        .catch(() => setAccess([]));
  }, [token, request]);
  const refreshEnvironments = useCallback(
    async () =>
      setEnvironments((await liveRequest("/api/environments")).environments),
    [liveRequest],
  );
  useEffect(() => {
    setEnvironment("");
    setEnvironments([]);
  }, [workspace]);
  useEffect(() => {
    if (token) void refreshEnvironments().catch(() => {});
  }, [token, refreshEnvironments]);
  const refresh = useCallback(async () => {
    setData(await request("/api/merchant/overview"));
    setConversations((await request("/api/agent/conversations")).conversations);
    setUpdated(new Date().toISOString());
  }, [request]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    if (!token) {
      setConnected(false);
      return;
    }
    setConnected(false);
    Promise.all([
      request("/api/agent/providers"),
      request("/api/merchant/overview"),
      request("/api/agent/conversations"),
      liveRequest("/api/auth/session"),
    ])
      .then(([providerData, overview, history, session]) => {
        if (!active) return;
        const ps: Provider[] = providerData.providers;
        setProviders(ps);
        setModel(ps.find((p) => p.id === provider)?.model ?? ps[0].model);
        setData(overview);
        setConversations(history.conversations);
        setWorkspaceName(
          session.workspaces.find(
            (w: { id: string; name: string }) => w.id === workspace,
          )?.name ?? workspace,
        );
        setRole(
          session.workspaces.find(
            (w: { id: string; role: string }) => w.id === workspace,
          )?.role ?? "viewer",
        );
        setUpdated(new Date().toISOString());
        setConnected(true);
        setError("");
      })
      .catch((e) => {
        if (active) {
          setError(String(e));
          setData(undefined);
        }
      });
    return () => {
      active = false;
    };
  }, [request, token, workspace]);
  useEffect(() => {
    if (tab === "assistant")
      bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy, tab]);
  useEffect(() => {
    localStorage.setItem("rac-studio-theme-v03", theme);
  }, [theme]);
  const connect = async () => {
    const ps: Provider[] = (await request("/api/agent/providers")).providers;
    setProviders(ps);
    setModel(ps.find((p) => p.id === provider)?.model || ps[0].model);
    await refresh();
    setConnected(true);
  };
  const load = async (conversationId: string) => {
    const value = await request(`/api/agent/conversations/${conversationId}`);
    setId(value.conversationId);
    setMessages(value.messages);
    setTab("assistant");
    setMenu(false);
  };
  const newChat = () => {
    setId(undefined);
    setMessages([]);
    setDraft("");
    setTab("assistant");
    setMenu(false);
    composer.current?.focus();
  };
  const intent = (text: string) => {
    setTab("assistant");
    setDraft(text);
    setMenu(false);
    requestAnimationFrame(() => composer.current?.focus());
  };
  const send = async () => {
    if (!draft.trim() || busy || !connected) return;
    const text = draft;
    setPendingText(text);
    setDraft("");
    await run(async () => {
      try {
        const v = await request("/api/agent/chat", {
          message: text,
          conversationId: id,
          inference: { provider, model: model || undefined },
        });
        setId(v.conversationId);
        setMessages(v.messages);
        await refresh();
      } catch (e) {
        setDraft(text);
        throw e;
      } finally {
        setPendingText("");
      }
    });
  };
  const apply = async (m: Message) => {
    await request(`/api/agent/tasks/${m.data.taskId}/apply`, { approve: true });
    if (id) await load(id);
    await refresh();
    await onChanged();
    setNotice({ key: "approvedAction" });
  };
  const onProduct = (productId: string) => setFocus(productId);
  const selected =
    data?.products.find((p) => p.id === focus) || data?.products[0];
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
  return (
    <div className="studio" data-theme={theme}>
      <a className="studio-skip" href="#studio-content">
        {t("assistant")}
      </a>
      <aside className={`studio-sidebar ${menu ? "open" : ""}`}>
        <a className="studio-brand" href="#merchant">
          <span className="brand-mark">
            <Icon name="spark" size={21} />
          </span>
          <span>
            commerce<span className="brand-subtitle">{t("studio")}</span>
          </span>
        </a>
        <button className="workspace-switch" onClick={() => setTab("users")}>
          <span className="shop-monogram">A</span>
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
          {nav
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
                aria-current={tab === n.id ? "page" : undefined}
                className={tab === n.id ? "active" : ""}
                onClick={() => {
                  setTab(n.id);
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
          <button onClick={() => setTab("commerce")}>
            <Icon name="settings" />
            {t("settings")}
          </button>
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
      {menu && (
        <button
          className="sidebar-scrim"
          aria-label={t("close")}
          onClick={() => setMenu(false)}
        />
      )}
      <div className="studio-shell">
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
              {workspaceName} <span>/</span> <strong>{tabLabel(tab)}</strong>
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
              {connected ? t("connected") : t("access")}
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
              aria-label={connected ? t("refresh") : t("connect")}
              disabled={busy}
              onClick={() => (connected ? run(refresh) : setTab("users"))}
            >
              {connected ? (
                <Icon name="refresh" size={18} />
              ) : (
                <>
                  <Icon name="link" size={16} />
                  <span>{t("connect")}</span>
                </>
              )}
            </button>
          </div>
        </header>
        {environment && (
          <div className="sandbox-banner">
            <span>
              {w("stage")} ·{" "}
              {environments.find((e) => e.id === environment)?.name}
            </span>
            <a
              href={`/?shop=${environment}&sandbox=1#`}
              target="_blank"
              rel="noreferrer"
            >
              {w("preview")} ↗
            </a>
          </div>
        )}
        <main
          id="studio-content"
          className={`studio-main view-${tab} ${["assistant", "overview", "knowledge"].includes(tab) ? "" : "is-workspace"}`}
        >
          <div className="studio-content">
            {(error || notice) && (
              <div
                className={`studio-notice ${error ? "is-error" : ""}`}
                role={error ? "alert" : "status"}
              >
                <div>
                  {error ? (
                    <>
                      <b>{t("failure")}</b>
                      <details>
                        <summary>{t("details")}</summary>
                        {error}
                      </details>
                    </>
                  ) : (
                    t(
                      notice!.key,
                      notice?.count != null ? { count: notice.count } : {},
                    )
                  )}
                </div>
                <button
                  className="icon-button"
                  aria-label={t("close")}
                  onClick={() => {
                    setError("");
                    setNotice(undefined);
                  }}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}
            {tab === "orders" ? (
              <OrdersManager
                request={request}
                headers={{
                  Authorization: `Bearer ${token}`,
                  "x-tenant": environment || workspace,
                }}
              />
            ) : tab === "customers" ? (
              <CustomersManager request={request} />
            ) : tab === "automation" ? (
              <AutomationView request={request} role={role} />
            ) : tab === "productData" ? (
              <ProductDataView request={request} />
            ) : tab === "storyfronts" ? (
              <StoryfrontView request={request} role={role} />
            ) : tab === "developers" ? (
              <DeveloperView
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
                    sessionStorage.setItem(
                      "rac-user-workspace",
                      session.workspace,
                    );
                    setWorkspace(session.workspace);
                    setWorkspaceName(
                      session.workspaces.find((w) => w.id === session.workspace)
                        ?.name ?? session.workspace,
                    );
                    history.replaceState(
                      null,
                      "",
                      `?shop=${session.workspace}#merchant`,
                    );
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
              <section className="studio-conversation">
                <div className="conversation-topline">
                  <span>
                    <Icon name="spark" size={15} />
                    {t("assistant")}
                  </span>
                  <button onClick={() => setSettings(true)}>
                    {provider === "ollama"
                      ? t("local")
                      : provider === "anthropic"
                        ? "Claude"
                        : "OpenAI"}
                    <span>{model}</span>
                    <Icon name="settings" size={15} />
                  </button>
                </div>
                <div className="studio-messages">
                  {!messages.length && !pendingText ? (
                    <div className="assistant-welcome">
                      <div className="welcome-symbol">
                        <Icon name="spark" size={32} />
                      </div>
                      <span className="kicker">{t("studio")}</span>
                      <h1>{t("welcome")}</h1>
                      <p>{t("welcomeSub")}</p>
                      {data && (
                        <div className="welcome-pulse">
                          <button onClick={() => setTab("overview")}>
                            <strong>{data.summary.ordersToday}</strong>
                            {t("orders")} · {t("today")}
                            <Icon name="arrow" size={14} />
                          </button>
                          <button onClick={() => setTab("knowledge")}>
                            <strong>{data.knowledge.indexedProducts}</strong>
                            {t("embeddings")}
                            <Icon name="arrow" size={14} />
                          </button>
                        </div>
                      )}
                      <div className="studio-prompts">
                        {[
                          ["graph", "promptRead"],
                          ["pulse", "promptPrice"],
                          ["box", "promptExperience"],
                        ].map(([icon, key]) => (
                          <button
                            key={key}
                            onClick={() => intent(t(key as "promptRead"))}
                          >
                            <Icon name={icon as "graph" | "pulse" | "box"} />
                            <span>{t(key as "promptRead")}</span>
                            <Icon name="arrow" size={16} />
                          </button>
                        ))}
                      </div>
                      {!connected && (
                        <button
                          className="access-cta"
                          onClick={() => setTab("users")}
                        >
                          <Icon name="lock" size={16} />
                          {t("connectFirst")}
                          <Icon name="arrow" size={16} />
                        </button>
                      )}
                    </div>
                  ) : (
                    messages.map((m) => (
                      <article
                        className={`studio-message ${m.role === "user" ? "from-user" : "from-assistant"}`}
                        key={m.id}
                      >
                        <div className="message-avatar">
                          <Icon
                            name={m.role === "user" ? "chat" : "spark"}
                            size={18}
                          />
                        </div>
                        <div className="message-body">
                          <span className="message-name">
                            {m.role === "user" ? t("you") : t("assistant")}
                          </span>
                          {m.role === "assistant" && !m.data.error ? (
                            <MessageText text={m.content} />
                          ) : (
                            <p>{m.data.error ? t("errorReply") : m.content}</p>
                          )}
                          {m.data.error && (
                            <details>
                              <summary>{t("details")}</summary>
                              {m.content}
                            </details>
                          )}
                          {m.data.preview && (
                            <>
                              <ProposalCard
                                message={m}
                                canApply={role !== "viewer"}
                                busy={busy}
                                onApply={() => run(() => apply(m))}
                              />
                              {m.data.preview.verifiedFacts && (
                                <details className="verified-facts">
                                  <summary>
                                    {t("savedContext")} · {t("evidence")}
                                  </summary>
                                  <dl>
                                    <div>
                                      <dt>{t("orders")}</dt>
                                      <dd>
                                        {
                                          m.data.preview.verifiedFacts
                                            .demoOrderCount
                                        }{" "}
                                        · {t("simulated")}
                                      </dd>
                                    </div>
                                    {m.data.preview.verifiedFacts.learningSignals?.map(
                                      (signal) => (
                                        <div key={signal.variant}>
                                          <dt>
                                            {signal.variant === "comparison"
                                              ? t("comparison")
                                              : t("discovery")}
                                          </dt>
                                          <dd>
                                            {signal.views} {t("views")}
                                          </dd>
                                          <dd>
                                            {signal.purchases} {t("purchases")}
                                          </dd>
                                        </div>
                                      ),
                                    )}
                                  </dl>
                                </details>
                              )}
                              <small className="message-metadata">
                                {m.data.preview.model} · {t("savedContext")}
                              </small>
                            </>
                          )}
                        </div>
                      </article>
                    ))
                  )}
                  {pendingText && (
                    <article className="studio-message from-user">
                      <div className="message-avatar">
                        <Icon name="chat" size={18} />
                      </div>
                      <div className="message-body">
                        <span className="message-name">{t("you")}</span>
                        <p>{pendingText}</p>
                      </div>
                    </article>
                  )}
                  {busy && (
                    <div className="studio-thinking" role="status">
                      <span className="thinking-dots">
                        <i />
                        <i />
                        <i />
                      </span>
                      {t("thinking")}
                    </div>
                  )}
                  <div ref={bottom} />
                </div>
                <div className="composer-wrap">
                  <form
                    className="studio-composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <label className="sr-only" htmlFor="studio-message">
                      {t("message")}
                    </label>
                    <textarea
                      id="studio-message"
                      ref={composer}
                      rows={2}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      placeholder={t("placeholder")}
                    />
                    <div>
                      <span>
                        <Icon name="lock" size={13} />
                        {t("trust")}
                      </span>
                      <button
                        type="submit"
                        className="studio-primary"
                        disabled={!connected || busy || !draft.trim()}
                        aria-label={t("send")}
                      >
                        <Icon name="send" size={18} />
                      </button>
                    </div>
                  </form>
                  <small>
                    {t("currentLocale")}: {locales[locale]} ·{" "}
                    {t("savedLanguage")}
                  </small>
                </div>
              </section>
            ) : data ? (
              tab === "apps" ? (
                <AppsManager request={request} token={token} role={role} />
              ) : tab === "commerce" ? (
                <SettingsWorkspace
                  request={request}
                  rights={access}
                  onConnections={() => setSettings(true)}
                  onTeam={() => setTab("users")}
                  onAutomation={() => setTab("automation")}
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
                  onProduct={onProduct}
                />
              ) : (
                <AgentsView data={data} onStorefront={onExit} />
              )
            ) : (
              <div className="studio-empty">
                <Icon name={nav.find((n) => n.id === tab)!.icon} size={48} />
                <h1>{tabLabel(tab)}</h1>
                <p>{t("connectFirst")}</p>
                <button
                  className="studio-primary"
                  onClick={() => setSettings(true)}
                >
                  {t("connect")}
                  <Icon name="link" size={18} />
                </button>
              </div>
            )}
          </div>
          {["assistant", "overview", "knowledge"].includes(tab) && (
            <PreviewPanel
              product={selected}
              request={request}
              connected={connected}
              onIntent={intent}
            />
          )}
        </main>
        <footer className="studio-statusbar">
          <span>
            <i className={connected ? "on" : ""} />
            {t("health")} · {connected ? t("healthy") : "—"}
          </span>
          <span>{t("demo")}</span>
          {updated && (
            <span>
              {t("lastUpdated")} {date(updated)}
            </span>
          )}
        </footer>
      </div>
      {previewOpen && (
        <PreviewDialog onClose={() => setPreviewOpen(false)}>
          <PreviewPanel
            product={selected}
            request={request}
            connected={connected}
            onIntent={(text) => {
              setPreviewOpen(false);
              intent(text);
            }}
          />
        </PreviewDialog>
      )}
      {settings && (
        <SettingsDialog
          token={token}
          onToken={(s) => {
            setToken(s);
            setConnected(false);
          }}
          connected={connected}
          onConnect={() => run(connect)}
          providers={providers}
          provider={provider}
          model={model}
          onProvider={(s) => {
            setProvider(s);
            setModel(providers.find((p) => p.id === s)?.model || "");
          }}
          onModel={setModel}
          onClose={() => setSettings(false)}
          busy={busy}
          onIndex={() =>
            run(async () => {
              const v = await request("/api/knowledge/reindex", {});
              await refresh();
              setNotice({ key: "indexed", count: v.indexed });
            })
          }
        />
      )}
    </div>
  );
}
