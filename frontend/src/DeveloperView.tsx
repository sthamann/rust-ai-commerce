/** Prompt-to-package review, staging and coding-agent task export share immutable build versions. */
import { useEffect, useState } from "react";
import type { RequestFn, Provider } from "./studio-types";
import type { Environment } from "./EnvironmentManager";
import { useWorkbenchText } from "./workbench-i18n";
type Build = {
  id: string;
  environment: string;
  app: string;
  version: string;
  digest: string;
  manifest: unknown;
  summary: Record<string, string>;
  state: "draft" | "staged";
  provider: string;
  model: string;
};
export default function DeveloperView({
  request,
  environments,
  role,
}: {
  request: RequestFn;
  environments: Environment[];
  role: string;
}) {
  const { w, locale } = useWorkbenchText();
  const [prompt, setPrompt] = useState("");
  const [env, setEnv] = useState(environments[0]?.id ?? "");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState("ollama");
  const [model, setModel] = useState("");
  const [builds, setBuilds] = useState<Build[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [agent, setAgent] = useState("codex");
  const [task, setTask] = useState("");
  const [manifest, setManifest] = useState("");
  const manage = ["owner", "admin"].includes(role);
  const load = async () => {
    const v = await request("/api/developer");
    setBuilds(v.builds);
    setProviders(v.providers.providers);
  };
  useEffect(() => {
    let active = true;
    request("/api/developer")
      .then((v) => {
        if (active) {
          setBuilds(v.builds);
          setProviders(v.providers.providers);
          setModel(v.providers.providers[0].model);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const configured = providers.find((p) => p.id === provider)?.configured;
  return (
    <div className="studio-page workbench">
      <div className="page-intro">
        <span className="kicker">{w("developers")}</span>
        <h1>{w("prompt")}</h1>
        <p>{w("developerHint")}</p>
      </div>
      <section className="studio-card developer-composer">
        <div className="workbench-row">
          <label>
            {w("stage")}
            <select value={env} onChange={(e) => setEnv(e.target.value)}>
              <option value="">{w("chooseStage")}</option>
              {environments.map((e) => (
                <option value={e.id} key={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {w("provider")}
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setModel(
                  providers.find((p) => p.id === e.target.value)?.model ?? "",
                );
              }}
            >
              {providers.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.id === "anthropic"
                    ? "Claude"
                    : p.id === "openai"
                      ? "OpenAI"
                      : w("localModel")}
                </option>
              ))}
            </select>
          </label>
          <label>
            {w("model")}
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              maxLength={128}
            />
          </label>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await request("/api/developer/generate", {
                environment: env,
                prompt,
                inference: { provider, model },
              });
            });
          }}
        >
          <label>
            {w("prompt")}
            <textarea
              rows={5}
              value={prompt}
              placeholder={w("promptExample")}
              required
              maxLength={8000}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <button
            className="studio-primary"
            disabled={busy || !env || !manage || !configured}
          >
            {w(busy ? "generating" : "generate")}
          </button>
          {!configured && <small>{w("providerMissing")}</small>}
        </form>
        <p className="muted">{w("scope")}</p>
      </section>
      {error && <p role="alert">{error}</p>}
      <section className="studio-card">
        <h2>{w("artifacts")}</h2>
        {!builds.length && <p>{w("noBuilds")}</p>}
        {builds.map((b) => (
          <article key={b.id} className="developer-build">
            <div>
              <strong>
                {b.app} <span className="soft-tag">v{b.version}</span>
              </strong>
              <span>{w(b.state)}</span>
            </div>
            <p>{b.summary?.[locale.slice(0, 2)] ?? b.summary?.en}</p>
            <small>
              {b.provider} · {b.model} ·{" "}
              {environments.find((e) => e.id === b.environment)?.name}
            </small>
            <details>
              <summary>{w("contract")}</summary>
              <pre>{JSON.stringify(b.manifest, null, 2)}</pre>
              <small>SHA-256: {b.digest}</small>
            </details>
            {b.state === "draft" && (
              <button
                className="studio-primary"
                disabled={busy || !manage}
                onClick={() =>
                  void run(async () => {
                    await request(`/api/developer/builds/${b.id}/stage`, {
                      approve: true,
                      digest: b.digest,
                    });
                  })
                }
              >
                {w("installStage")}
              </button>
            )}
          </article>
        ))}
      </section>
      <section className="studio-card">
        <h2>{w("externalAgent")}</h2>
        <p>{w("agentHint")}</p>
        <div className="workbench-row">
          <select
            aria-label={w("externalAgent")}
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
          >
            <option value="codex">Codex</option>
            <option value="claude_code">Claude Code</option>
          </select>
          <button
            className="studio-secondary"
            disabled={!manage || !env || !prompt || busy}
            onClick={() =>
              void run(async () => {
                const exported = await request("/api/developer/task", {
                  environment: env,
                  prompt,
                  agent,
                });
                exported.mcpConfig.mcpServers[
                  "rust-commerce-dev"
                ].env.COMMERCE_URL = location.origin;
                setTask(
                  exported.task +
                    "\n\n" +
                    JSON.stringify(
                      {
                        appSchema: exported.appSchema,
                        mcpConfig: exported.mcpConfig,
                      },
                      null,
                      2,
                    ),
                );
              })
            }
          >
            {w("export")}
          </button>
        </div>
        {task && (
          <textarea rows={8} readOnly value={task} aria-label={w("export")} />
        )}
        <details>
          <summary>{w("import")}</summary>
          <textarea
            rows={8}
            value={manifest}
            aria-label={w("contract")}
            onChange={(e) => setManifest(e.target.value)}
          />
          <button
            className="studio-secondary"
            disabled={!manage || !env || !prompt || busy || !manifest}
            onClick={() =>
              void run(async () => {
                const parsed = JSON.parse(manifest);
                await request("/api/developer/import", {
                  environment: env,
                  prompt,
                  summary: parsed.name,
                  manifest: parsed,
                });
              })
            }
          >
            {w("import")}
          </button>
        </details>
      </section>
    </div>
  );
}
