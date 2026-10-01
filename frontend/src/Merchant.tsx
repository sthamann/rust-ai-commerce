import { useEffect, useRef, useState } from "react";

type Provider = {
  id: string;
  name: string;
  model: string;
  configured: boolean;
};
type Product = { id: string; name: string; price: number; stock: number };
type Message = {
  id: number;
  role: string;
  content: string;
  applied: boolean;
  data: {
    error?: boolean;
    taskId?: string;
    preview?: {
      model: string;
      inference: string;
      catalogBefore: Product[];
      proposal: {
        changes: { product_id: string; price?: number; stock?: number }[];
        experience?: { mode: string; headline: string };
      };
      knowledge?: {
        needs: { product_id: string; need: string }[];
        pairs: { left: string; right: string }[];
      };
    };
  };
};
const money = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    n,
  );
export default function Merchant({
  onChanged,
}: {
  onChanged: () => Promise<void>;
}) {
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);
  async function request(path: string, body?: unknown) {
    const r = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = await r.json();
    if (!r.ok)
      throw new Error(value.errors?.[0]?.detail || "Anfrage fehlgeschlagen");
    return value;
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function refreshList() {
    setConversations((await request("/api/agent/conversations")).conversations);
  }
  async function connect() {
    const ps: Provider[] = (await request("/api/agent/providers")).providers;
    setProviders(ps);
    setModel(ps.find((p) => p.id === provider)?.model || ps[0].model);
    await refreshList();
    setConnected(true);
  }
  async function load(conversationId: string) {
    const value = await request(`/api/agent/conversations/${conversationId}`);
    setId(value.conversationId);
    setMessages(value.messages);
  }
  async function send() {
    if (!draft.trim() || busy) return;
    const text = draft;
    setDraft("");
    await run(async () => {
      let value;
      try {
        value = await request("/api/agent/chat", {
          message: text,
          conversationId: id,
          inference: { provider, model: model || undefined },
        });
      } catch (e) {
        setDraft(text);
        throw e;
      }
      setId(value.conversationId);
      setMessages(value.messages);
      await refreshList();
    });
  }
  const latest = [...messages].reverse().find((m) => m.data.preview)
    ?.data.preview;
  return (
    <main className="command-center">
      <aside className="command-sidebar">
        <div className="eyebrow">ATELIER / OPERATIONS</div>
        <h2>
          Commerce
          <br />
          im Gespräch.
        </h2>
        <button
          className="primary"
          disabled={!connected || busy}
          onClick={() => {
            setId(undefined);
            setMessages([]);
          }}
        >
          + Neues Gespräch
        </button>
        <div className="conversation-list" aria-label="Gespeicherte Gespräche">
          {conversations.map((c) => (
            <button
              key={c.id}
              disabled={busy}
              className={id === c.id ? "selected" : ""}
              onClick={() => run(() => load(c.id))}
            >
              {c.title}
            </button>
          ))}
        </div>
        <label className="mobile-conversations">
          Gespeichertes Gespräch
          <select
            value={id || ""}
            disabled={!connected || busy}
            onChange={(e) => {
              if (e.target.value) run(() => load(e.target.value));
              else {
                setId(undefined);
                setMessages([]);
              }
            }}
          >
            <option value="">Neues Gespräch</option>
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <div className="connection-panel">
          <label>
            Händlerzugang
            <input
              type="password"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setConnected(false);
              }}
              autoComplete="off"
              placeholder="Lokaler Merchant-Token"
            />
          </label>
          <button disabled={!token || busy} onClick={() => run(connect)}>
            {connected ? "✓ Verbunden · neu laden" : "Verbinden"}
          </button>
          <small>
            Der Zugang bleibt im Arbeitsspeicher dieses Tabs. API-Schlüssel
            werden auf dem Server konfiguriert.
          </small>
        </div>
      </aside>
      <section className="chat-workspace">
        <div className="chat-toolbar">
          <div>
            <span className="status-dot" />
            {connected ? "Commerce-Kern verbunden" : "Händlerzugang verbinden"}
          </div>
          <button onClick={() => setSettings(!settings)}>
            Modell & Verbindungen ⚙
          </button>
        </div>
        {settings && (
          <section className="model-settings">
            <label>
              Modellanbieter
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setModel(
                    providers.find((p) => p.id === e.target.value)?.model || "",
                  );
                }}
              >
                {(providers.length
                  ? providers
                  : [
                      {
                        id: "ollama",
                        name: "Lokales Modell",
                        model: "",
                        configured: true,
                      },
                    ]
                ).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.configured ? "" : " · Schlüssel fehlt"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Modell
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Server-Standard"
              />
            </label>
            <p>
              OpenAI: OPENAI_API_KEY · Claude: ANTHROPIC_API_KEY in der lokalen
              .env. Bei Auswahl eines Cloud-Anbieters werden Auftrag und
              Shop-Kontext an diesen Anbieter übertragen.
            </p>
            <div className="row">
              <a
                href="https://github.com/sthamann/rust-ai-commerce/blob/main/docs/connectors.md"
                target="_blank"
                rel="noreferrer"
              >
                ChatGPT & Claude per MCP verbinden ↗
              </a>
              <button
                disabled={busy || !connected}
                onClick={() =>
                  run(async () => {
                    const v = await request("/api/knowledge/reindex", {});
                    setError(`${v.indexed} Produkte semantisch indiziert.`);
                  })
                }
              >
                Suchwissen aktualisieren
              </button>
            </div>
          </section>
        )}
        {error && (
          <div className="chat-notice" role="status">
            {error}
          </div>
        )}
        <div className="chat-history" aria-live="polite" aria-busy={busy}>
          {messages.length === 0 && (
            <div className="chat-welcome">
              <div className="eyebrow">
                ZIELE BESCHREIBEN. VERÄNDERUNGEN VERSTEHEN.
              </div>
              <h1>
                Was soll dein
                <br />
                Shop heute erreichen?
              </h1>
              <p>
                Besprich dein Sortiment, gestalte die Storefront oder plane eine
                Preisänderung. Du siehst die konkrete Wirkung, bevor du sie
                freigibst.
              </p>
              <div className="prompt-cards">
                {[
                  "Welche Produkte passen für eine kompakte Leseecke zusammen?",
                  "Setze den Bruttopreis der Lampe auf 74,90 Euro.",
                  "Gestalte die Startseite als Vergleich mit der Überschrift: Dein Arbeitsplatz, durchdacht.",
                ].map((text) => (
                  <button key={text} onClick={() => setDraft(text)}>
                    {text}
                    <span>↗</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <article key={m.id} className={`chat-message ${m.role}`}>
              <div className="message-author">
                {m.role === "user"
                  ? "Du"
                  : `Commerce · ${m.data.preview?.inference || "System"}`}
              </div>
              <p className="message-content">{m.content}</p>
              {m.data.preview && (
                <>
                  {(m.data.preview.proposal.changes.length > 0 ||
                    m.data.preview.proposal.experience) && (
                    <section className="change-card">
                      <div className="eyebrow">
                        {m.applied
                          ? "✓ ANGEWENDET"
                          : "VORSCHAU · NOCH NICHT ANGEWENDET"}
                      </div>
                      {m.data.preview.proposal.changes.map((c) => {
                        const before = m.data.preview!.catalogBefore.find(
                          (p) => p.id === c.product_id,
                        );
                        return (
                          <div className="change-row" key={c.product_id}>
                            <b>{before?.name || c.product_id}</b>
                            {c.price != null && (
                              <span>
                                {money(before?.price || 0)} →{" "}
                                <strong>{money(c.price)}</strong>
                              </span>
                            )}
                            {c.stock != null && (
                              <span>
                                Bestand {before?.stock} → {c.stock}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {m.data.preview.proposal.experience && (
                        <p>
                          Storefront: {m.data.preview.proposal.experience.mode}
                          <br />„{m.data.preview.proposal.experience.headline}“
                        </p>
                      )}
                      {!m.applied && (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await request(
                                `/api/agent/tasks/${m.data.taskId}/apply`,
                                { approve: true },
                              );
                              if (id) await load(id);
                              await onChanged();
                            })
                          }
                        >
                          Diese Änderungen freigeben ↗
                        </button>
                      )}
                    </section>
                  )}
                  <small className="message-model">
                    {m.data.preview.model} · gespeicherter Shop-Kontext
                  </small>
                </>
              )}
            </article>
          ))}
          {busy && (
            <div className="thinking" role="status">
              ● Commerce verarbeitet deinen Auftrag …
            </div>
          )}
          <div ref={bottom} />
        </div>
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="Nachricht an den Commerce-Agenten"
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
            rows={2}
            placeholder="Beschreibe dein Ziel oder stelle eine Frage …"
          />
          <button
            className="primary"
            type="submit"
            disabled={!connected || busy || !draft.trim()}
          >
            Senden ↑
          </button>
          <small>
            {providers.find((p) => p.id === provider)?.name || "Lokales Modell"}{" "}
            · Änderungen werden als Vorschau geplant.
          </small>
        </form>
      </section>
      <aside className="context-rail">
        <div className="eyebrow">VERBUNDENES SHOPWISSEN</div>
        <h3>Ein gemeinsamer Kontext.</h3>
        <p>
          Produkte, Bedürfnisse und Kombinationen im Apache-AGE-Graphen.
          Verbindliche Preise und Bestände aus dem Commerce-Kern.
        </p>
        {latest && (
          <>
            <div className="context-count">
              <strong>{latest.catalogBefore.length}</strong> Produkte im Auftrag
            </div>
            <div className="context-count">
              <strong>{latest.knowledge?.needs.length || 0}</strong> belegte
              Demo-Beziehungen
            </div>
            <h4>Zusammen gedacht</h4>
            {latest.knowledge?.pairs.map((p, i) => (
              <div className="graph-pair" key={i}>
                {p.left}
                <span>↔</span>
                {p.right}
              </div>
            ))}
          </>
        )}
        <div className="context-foot">
          MCP / UCP
          <br />
          Gemeinsame Commerce-Fähigkeiten.
        </div>
      </aside>
    </main>
  );
}
