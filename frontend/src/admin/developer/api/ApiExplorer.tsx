/** Source-derived static route explorer, runtime app discovery and isolated same-origin read tests. */
import { useEffect, useState } from "react";
import routes from "./routes.json";
import type { RequestFn } from "../../shell/studio-types";
import { createStudioRequest } from "../../shell/requests";
import { useLocale } from "../../../shared/i18n/i18n";
import { useApiText } from "./api-i18n";
type Route = { path: string; method: string; source: string };
export function routePath(route: Route, params: Record<string, string>) {
  return route.path.replace(/\{([^}]+)\}/g, (_, key) => {
    const value = params[key]?.trim();
    if (!value || value === "." || value === ".." || /[\/\\?#]/.test(value))
      throw Error(`Invalid parameter: ${key}`);
    return encodeURIComponent(value);
  });
}
const reads = (r: Route) =>
  r.method === "GET" &&
  r.path !== "/api/auth/logout" &&
  r.path !== "/mcp" &&
  !r.path.endsWith(".js") &&
  !r.path.endsWith("/pdf") &&
  !r.path.includes("/company-logo/") &&
  !r.path.includes("/downloads/") &&
  !r.path.startsWith("/api/platform/") &&
  !r.path.includes("/assets/");
export default function ApiExplorer({
  request,
  workspace,
}: {
  request: RequestFn;
  workspace: string;
}) {
  const t = useApiText(),
    { locale } = useLocale();
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Route>(
      routes.find(
        (r) => r.path === "/api/merchant/products" && r.method === "GET",
      )!,
    ),
    [params, setParams] = useState<Record<string, string>>({}),
    [key, setKey] = useState(""),
    [result, setResult] = useState(""),
    [busy, setBusy] = useState(false),
    [apps, setApps] = useState<any[]>([]);
  useEffect(() => {
    let active = true;
    request("/api/apps")
      .then((v) => {
        if (active) setApps(v.packages ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [request]);
  const run = async (mcp = false) => {
    setBusy(true);
    setResult("");
    const start = performance.now();
    try {
      const transport = key
        ? createStudioRequest(key, workspace, locale)
        : request;
      const value = mcp
        ? await transport(
            "/mcp",
            { jsonrpc: "2.0", id: 1, method: "tools/list" },
            "POST",
          )
        : await transport(routePath(selected, params), undefined, "GET");
      setResult(
        `${Math.round(performance.now() - start)} ms\n${JSON.stringify(value, null, 2)}`,
      );
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="studio-card">
      <h2>{t("routes")}</h2>
      <p>{t("readOnly")}</p>
      <p>
        {t("scope")}: <code>{workspace}</code>
      </p>
      <label>
        {t("search")}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="api-explorer-grid">
        <div className="api-route-list">
          {routes
            .filter((r) =>
              `${r.method} ${r.path}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((r) => (
              <button
                type="button"
                className="api-route"
                aria-label={`${r.method} ${r.path}`}
                key={r.method + r.path}
                aria-pressed={r === selected}
                onClick={() => {
                  setSelected(r);
                  setParams({});
                  setResult("");
                }}
              >
                <span className="soft-tag">{r.method}</span>
                <code>{r.path}</code>
              </button>
            ))}
        </div>
        <div>
          <h3>
            <span className="soft-tag">{selected.method}</span>{" "}
            <code>{selected.path}</code>
          </h3>
          <small>{selected.source}</small>
          {Array.from(selected.path.matchAll(/\{([^}]+)\}/g), (m) => m[1]).map(
            (param) => (
              <label key={param}>
                {param}
                <input
                  required
                  value={params[param] ?? ""}
                  onChange={(e) =>
                    setParams({ ...params, [param]: e.target.value })
                  }
                />
              </label>
            ),
          )}
          <label>
            {t("key")}
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <div className="workbench-row">
            <button
              className="studio-primary"
              disabled={busy || !reads(selected)}
              onClick={() => void run()}
            >
              {t(busy ? "testing" : "test")}
            </button>
            <button
              className="studio-secondary"
              disabled={busy}
              onClick={() => void run(true)}
            >
              {t("protocol")}
            </button>
          </div>
          {!!result && (
            <>
              <h3>{t("result")}</h3>
              <pre className="api-response" role="status">
                {result}
              </pre>
            </>
          )}
        </div>
      </div>
      <details>
        <summary>{t("apps")}</summary>
        {apps.map((p) => (
          <article key={p.id}>
            <strong>{p.id}</strong>
            <pre>{JSON.stringify(p.manifest.apiRoutes ?? [], null, 2)}</pre>
          </article>
        ))}
      </details>
    </section>
  );
}
