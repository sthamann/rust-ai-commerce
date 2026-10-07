/** StudioConversation: focused Studio view; state and commands come from the session-scoped controller. */
import StudioComposer from "./StudioComposer";
import { useExperienceUIText } from "../../shared/i18n/experience-ui-i18n";

import "../../shared/styles/workbench.css";
import Icon from "../../shared/ui/Icon";
import MessageText from "../assistant/MessageText";
import ProposalCard from "../assistant/ProposalCard";
import "../styles/operations.css";
import "../styles/studio.css";

import { useStudio } from "./StudioContext";

export default function StudioConversation({
  compact = false,
  onProviderSettings,
}: {
  compact?: boolean;
  onProviderSettings?: () => void;
}) {
  const { u } = useExperienceUIText();
  const {
    t,
    setSettings,
    provider,
    providers,
    model,
    messages,
    pendingText,
    data,
    selectTab,
    intent,
    connected,
    role,
    busy,
    run,
    apply,
    bottom,
  } = useStudio();
  return (
    <section className="studio-conversation">
      <div className="conversation-topline">
        <span>
          <Icon name="spark" size={15} />
          {t("assistant")}
        </span>
        <button onClick={onProviderSettings ?? (() => setSettings(true))}>
          {provider === "ollama"
            ? t("local")
            : provider === "platform"
              ? u("platformModel")
              : (providers.find((entry) => entry.id === provider)?.name ??
                t("assistant"))}
          <span>{model}</span>
          <Icon name="settings" size={15} />
        </button>
      </div>
      <div className="studio-messages">
        {!messages.length && !pendingText && !compact ? (
          <div className="assistant-welcome">
            <div className="welcome-symbol">
              <Icon name="spark" size={32} />
            </div>
            <span className="kicker">{t("studio")}</span>
            <h1>{t("welcome")}</h1>
            <p>{t("welcomeSub")}</p>
            {data && (
              <div className="welcome-pulse">
                <button onClick={() => selectTab("overview")}>
                  <strong>{data.summary.ordersToday}</strong>
                  {t("orders")} · {t("today")}
                  <Icon name="arrow" size={14} />
                </button>
                <button onClick={() => selectTab("knowledge")}>
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
              <button className="access-cta" onClick={() => selectTab("users")}>
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
                <Icon name={m.role === "user" ? "chat" : "spark"} size={18} />
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
                              {m.data.preview.verifiedFacts.demoOrderCount} ·{" "}
                              {t("simulated")}
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
      <StudioComposer />
    </section>
  );
}
