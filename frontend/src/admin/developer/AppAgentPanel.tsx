/** Coding agents receive the current Manifest IR and authoritative schema; imported edits round-trip to the canvas. */
import { useControlText } from "../../shared/i18n/control-i18n";
import { useState } from "react";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import type { RequestFn } from "../shell/studio-types";
import type { Manifest } from "../../shared/apps/native/types";
import type { AppStudio } from "./useAppStudio";
import { compile } from "./app-model";
export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const el = document.createElement("a");
  el.href = url;
  el.download = name;
  el.click();
  URL.revokeObjectURL(url);
}
export default function AppAgentPanel({
  studio,
  request,
}: {
  studio: AppStudio;
  request: RequestFn;
}) {
  const c = useControlText();
  const { a } = useAppStudioText(),
    { w } = useWorkbenchText();
  const [prompt, setPrompt] = useState(""),
    [provider, setProvider] = useState("platform"),
    [model, setModel] = useState(""),
    [agent, setAgent] = useState("codex"),
    [task, setTask] = useState(""),
    [json, setJson] = useState("");
  const agentNames = { codex: "Codex", claude_code: "Claude Code" };
  const configured = studio.providers.find(
    (p) => p.id === provider,
  )?.configured;
  return (
    <div className="app-agent-panel">
      <section className="app-model-card">
        <h2>{a("prompt")}</h2>
        <p>{a("hint")}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void studio.run(() =>
              studio.generate(
                prompt,
                provider,
                model ||
                  studio.providers.find((p) => p.id === provider)?.model ||
                  "",
              ),
            );
          }}
        >
          <textarea
            rows={5}
            required
            value={prompt}
            maxLength={8000}
            placeholder={w("promptExample")}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="app-agent-options">
            <label>
              {w("provider")}
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setModel("");
                }}
              >
                {studio.providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === "platform" ? c("platformDefault") : p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {w("model")}
              <input
                value={
                  model ||
                  studio.providers.find((p) => p.id === provider)?.model ||
                  ""
                }
                onChange={(e) => setModel(e.target.value)}
                maxLength={128}
              />
            </label>
            <button
              className="studio-primary"
              disabled={!studio.env || studio.busy || !configured}
            >
              {w(studio.busy ? "generating" : "generate")}
            </button>
          </div>
          {!configured && <small>{w("providerMissing")}</small>}
        </form>
      </section>
      <section className="app-model-card">
        <h2>{w("externalAgent")}</h2>
        <p>{w("agentHint")}</p>
        <div className="app-agent-options">
          <select
            aria-label={w("externalAgent")}
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
          >
            <option value="codex">{agentNames.codex}</option>
            <option value="claude_code">{agentNames.claude_code}</option>
          </select>
          <button
            className="studio-secondary"
            disabled={!studio.env || !prompt || studio.busy}
            onClick={() =>
              void studio.run(async () => {
                const v = await request("/api/developer/task", {
                  environment: studio.env,
                  prompt,
                  agent,
                  manifest: studio.manifest,
                });
                setTask(JSON.stringify(v, null, 2));
              })
            }
          >
            {w("export")}
          </button>
          <button
            className="studio-secondary"
            disabled={studio.busy}
            onClick={() =>
              void studio.run(async () =>
                downloadJson(
                  "app-studio-schema.json",
                  await request("/api/developer/schema"),
                ),
              )
            }
          >
            {a("schema")}
          </button>
          <button
            className="studio-secondary"
            onClick={() =>
              downloadJson(`${studio.manifest.id}.json`, studio.manifest)
            }
          >
            {a("download")}
          </button>
        </div>
        {task && (
          <textarea aria-label={w("export")} rows={8} value={task} readOnly />
        )}
      </section>
      <section className="app-model-card">
        <h2>{a("import")}</h2>
        <textarea
          aria-label={w("contract")}
          rows={10}
          value={json}
          onChange={(e) => setJson(e.target.value)}
        />
        <button
          className="studio-primary"
          disabled={!json || studio.busy}
          onClick={() => {
            try {
              const parsed = JSON.parse(json),
                m = (parsed.manifest ?? parsed) as Manifest;
              if (
                !m ||
                m.runtime !== "declarative" ||
                !Array.isArray(m.entities) ||
                !Array.isArray(m.views) ||
                !Array.isArray(m.surfaces)
              )
                throw Error(a("invalid"));
              studio.edit(compile(m));
              studio.setError("");
            } catch (e) {
              studio.setError((e as Error).message);
            }
          }}
        >
          {a("import")}
        </button>
      </section>
    </div>
  );
}
