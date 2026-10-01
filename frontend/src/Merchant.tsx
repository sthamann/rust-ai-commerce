import { useCallback, useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "./Icon";
import { locales, useLocale } from "./i18n";
import type {
  Message,
  Overview,
  Preview,
  Provider,
  RequestFn,
} from "./studio-types";
import {
  AgentsView,
  KnowledgeView,
  OverviewView,
  PreviewPanel,
} from "./StudioViews";
import "./studio.css";
type Tab = "assistant" | "overview" | "knowledge" | "agents";
function SettingsDialog({
  token,
  onToken,
  connected,
  onConnect,
  providers,
  provider,
  model,
  onProvider,
  onModel,
  onClose,
  onIndex,
  busy,
}: {
  token: string;
  onToken: (s: string) => void;
  connected: boolean;
  onConnect: () => void;
  providers: Provider[];
  provider: string;
  model: string;
  onProvider: (s: string) => void;
  onModel: (s: string) => void;
  onClose: () => void;
  onIndex: () => void;
  busy: boolean;
}) {
  const { t } = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog ref={dialog} className="studio-dialog" onClose={onClose}>
      <div className="dialog-heading">
        <div>
          <span className="kicker">{t("studio")}</span>
          <h2>{t("settings")}</h2>
        </div>
        <button
          className="icon-button"
          aria-label={t("close")}
          onClick={() => dialog.current?.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      <section>
        <h3>
          <Icon name="lock" size={18} />
          {t("access")}
        </h3>
        <label>
          {t("token")}
          <input
            autoComplete="off"
            type="password"
            value={token}
            onChange={(e) => onToken(e.target.value)}
            placeholder="MERCHANT_TOKEN"
          />
        </label>
        <p>{t("tokenHint")}</p>
        <button
          className="studio-primary"
          disabled={!token || busy}
          onClick={onConnect}
        >
          <Icon name={connected ? "check" : "link"} size={18} />
          {connected ? t("connected") : t("connect")}
        </button>
      </section>
      <section>
        <h3>
          <Icon name="spark" size={18} />
          {t("assistant")}
        </h3>
        <label>
          {t("provider")}
          <select value={provider} onChange={(e) => onProvider(e.target.value)}>
            {(providers.length
              ? providers
              : [
                  {
                    id: "ollama",
                    name: t("local"),
                    model: "",
                    configured: true,
                  },
                ]
            ).map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === "ollama" ? t("local") : p.name}
                {p.configured ? "" : ` · ${t("missingKey")}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("model")}
          <input
            value={model}
            onChange={(e) => onModel(e.target.value)}
            placeholder={t("serverDefault")}
          />
        </label>
        <p>{t("cloudDisclosure")}</p>
        <button
          className="studio-secondary"
          disabled={!connected || busy}
          onClick={onIndex}
        >
          <Icon name="refresh" size={16} />
          {t("index")}
        </button>
      </section>
    </dialog>
  );
}
function ProposalCard({
  message,
  onApply,
  busy,
}: {
  message: Message;
  onApply: () => void;
  busy: boolean;
}) {
  const { t, money } = useLocale();
  const preview = message.data.preview;
  if (!preview) return null;
  const changes = preview.proposal.changes;
  if (!changes.length && !preview.proposal.experience) return null;
  return (
    <section
      className={`proposal-review ${message.applied ? "is-applied" : ""}`}
    >
      <header>
        <div className="review-status">
          <Icon name={message.applied ? "check" : "pulse"} size={18} />
          <span>{message.applied ? t("applied") : t("pending")}</span>
        </div>
        <span>{changes.length || 1}</span>
      </header>
      {changes.map((c) => {
        const before = preview.catalogBefore.find((p) => p.id === c.product_id);
        return (
          <div className="review-product" key={c.product_id}>
            <b>{before?.name || c.product_id}</b>
            {c.price != null && (
              <div>
                <span>{t("grossPrice")}</span>
                <div className="before-after">
                  <span>
                    <small>{t("before")}</small>
                    {money(before?.price || 0)}
                  </span>
                  <Icon name="arrow" size={16} />
                  <strong>
                    <small>{t("after")}</small>
                    {money(c.price)}
                  </strong>
                </div>
              </div>
            )}
            {c.stock != null && (
              <div>
                <span>{t("stock")}</span>
                <div className="before-after">
                  <span>{before?.stock}</span>
                  <Icon name="arrow" size={16} />
                  <strong>{c.stock}</strong>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {preview.proposal.experience && (
        <div className="review-product">
          <b>{t("storefront")}</b>
          <p>
            {preview.proposal.experience.mode === "comparison"
              ? t("comparison")
              : preview.proposal.experience.mode === "discovery"
                ? t("discovery")
                : t("summary")}
          </p>
          <blockquote>{preview.proposal.experience.headline}</blockquote>
        </div>
      )}
      {!message.applied && (
        <footer>
          <span>
            <Icon name="lock" size={14} />
            {t("trust")}
          </span>
          <button className="studio-primary" disabled={busy} onClick={onApply}>
            {t("approve")}
            <Icon name="check" size={18} />
          </button>
        </footer>
      )}
    </section>
  );
}
export default function Merchant({
  onChanged,
  onExit,
}: {
  onChanged: () => Promise<void>;
  onExit: () => void;
}) {
  const { locale, setLocale, t, money, date } = useLocale();
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
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
  const request: RequestFn = useCallback(
    async (path, body) => {
      const r = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-commerce-locale": locale,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const value = await r.json();
      if (!r.ok) throw new Error(value.errors?.[0]?.detail || r.statusText);
      return value;
    },
    [token, locale],
  );
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
    if (connected) void refresh().catch((e) => setError(String(e)));
  }, [connected, locale, refresh]);
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
    { id: "knowledge", icon: "graph" },
    { id: "agents", icon: "agents" },
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
        <button className="workspace-switch" onClick={() => setSettings(true)}>
          <span className="shop-monogram">A</span>
          <span>
            Atelier<small>{t("demo")}</small>
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
          {nav.map((n) => (
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
              <span>{t(n.id)}</span>
              {n.id === "overview" && data?.summary.pendingPlans ? (
                <b>{data.summary.pendingPlans}</b>
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
          <button onClick={() => setSettings(true)}>
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
            <span>v0.3</span>
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
              Atelier <span>/</span> <strong>{t(tab)}</strong>
            </span>
          </div>
          <div className="topbar-actions">
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
              onClick={() => (connected ? run(refresh) : setSettings(true))}
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
        <main id="studio-content" className={`studio-main view-${tab}`}>
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
            {tab === "assistant" ? (
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
                          onClick={() => setSettings(true)}
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
              tab === "overview" ? (
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
                <h1>{t(tab)}</h1>
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
          {tab !== "agents" && (
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

function PreviewDialog({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useLocale();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="studio-preview-dialog" onClose={onClose}>
      <button
        className="icon-button preview-close"
        aria-label={t("close")}
        onClick={() => ref.current?.close()}
      >
        <Icon name="close" />
      </button>
      {children}
    </dialog>
  );
}

function MessageText({ text }: { text: string }) {
  const pieces = text
    .replace(/^([ \t]*)[-*] +/gm, "$1• ")
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <p>
      {pieces.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : part.startsWith("`") && part.endsWith("`") ? (
          <code key={i}>{part.slice(1, -1)}</code>
        ) : (
          part
        ),
      )}
    </p>
  );
}
