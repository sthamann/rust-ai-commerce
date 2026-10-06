/** Central inference editor; write-only secrets, optimistic revisions and explicit environment fallback. */
import { useEffect, useState } from "react";
import { usePlatformText } from "../shared/i18n/platform-i18n";
import { useControlText } from "../shared/i18n/control-i18n";
import {
  platformRequest as request,
  type AISettings,
  type AIProvider,
} from "./platform-api";
const providerNames: Record<string, string> = {
  ollama: "Ollama",
  openai: "OpenAI",
  anthropic: "Claude",
};
const defaults: Record<string, AIProvider> = {
  ollama: {
    model: "qwen3.6:35b",
    endpoint: "https://ollama.example.com",
    enabled: true,
  },
  openai: {
    model: "gpt-6-sol",
    endpoint: "https://api.openai.com/v1",
    enabled: true,
  },
  anthropic: {
    model: "claude-sonnet-5-5",
    endpoint: "https://api.anthropic.com/v1",
    enabled: true,
  },
};
export default function PlatformAI({ token }: { token: string }) {
  const t = usePlatformText(),
    c = useControlText();
  const [data, setData] = useState<AISettings>(),
    [providers, setProviders] = useState(defaults),
    [selected, setSelected] = useState("ollama");
  const [keys, setKeys] = useState<Record<string, string>>({}),
    [clear, setClear] = useState<Record<string, boolean>>({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = (v: AISettings) => {
    setData(v);
    setSelected(
      v.settings.defaultProvider ?? v.effective?.defaultProvider ?? "ollama",
    );
    setProviders(
      Object.fromEntries(
        Object.entries(defaults).map(([id, p]) => [
          id,
          { ...p, ...v.settings.providers?.[id] },
        ]),
      ),
    );
    setKeys({});
    setClear({});
  };
  useEffect(() => {
    let live = true;
    request<AISettings>(token, "/api/platform/ai")
      .then((v) => {
        if (live) load(v);
      })
      .catch(() => {
        if (live) setMessage(t("retry"));
      });
    return () => {
      live = false;
    };
  }, [token]);
  const save = async () => {
    if (!data || busy) return;
    setBusy(true);
    setMessage("");
    try {
      load(
        await request<AISettings>(
          token,
          "/api/platform/ai",
          {
            revision: data.revision,
            settings: { defaultProvider: selected, providers },
            keys,
            clearKeys: clear,
          },
          "PUT",
        ),
      );
      setMessage(c("saved"));
    } catch {
      setMessage(t("retry"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="platform-panel">
      <h2>{c("ai")}</h2>
      <p className="platform-note">{c("inherited")}</p>
      {!data?.encryptedStorageReady && (
        <p role="status">{c("encryptionMissing")}</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          {c("defaultProvider")}
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {Object.keys(defaults).map((id) => (
              <option key={id} value={id}>
                {providerNames[id]}
              </option>
            ))}
          </select>
        </label>
        <div className="platform-provider-grid">
          {Object.entries(providers).map(([id, p]) => (
            <fieldset key={id}>
              <legend>{providerNames[id]}</legend>
              <span className="platform-status">
                {c(
                  data?.effective?.providers.find((v) => v.id === id)
                    ?.configured
                    ? "configured"
                    : "missing",
                )}
              </span>
              <label className="platform-checkbox">
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) =>
                    setProviders({
                      ...providers,
                      [id]: { ...p, enabled: e.target.checked },
                    })
                  }
                />
                {c("enabled")}
              </label>
              <label>
                {c("endpoint")}
                <input
                  type="url"
                  required
                  value={p.endpoint}
                  onChange={(e) =>
                    setProviders({
                      ...providers,
                      [id]: { ...p, endpoint: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                {c("model")}
                <input
                  required
                  maxLength={128}
                  value={p.model}
                  onChange={(e) =>
                    setProviders({
                      ...providers,
                      [id]: { ...p, model: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                {c("key")}
                <input
                  type="password"
                  autoComplete="new-password"
                  disabled={!data?.encryptedStorageReady}
                  value={keys[id] ?? ""}
                  onChange={(e) => setKeys({ ...keys, [id]: e.target.value })}
                />
              </label>
              {data?.keyStored[id] && (
                <>
                  <small>{c("keySaved")}</small>
                  <label className="platform-checkbox">
                    <input
                      type="checkbox"
                      checked={clear[id] ?? false}
                      onChange={(e) =>
                        setClear({ ...clear, [id]: e.target.checked })
                      }
                    />
                    {c("keyRemove")}
                  </label>
                </>
              )}
            </fieldset>
          ))}
        </div>
        <p className="platform-note">{c("keyHint")}</p>
        {message && <p role="status">{message}</p>}
        <button className="platform-primary" disabled={busy || !data}>
          {busy ? t("loading") : c("apply")}
        </button>
      </form>
    </section>
  );
}
