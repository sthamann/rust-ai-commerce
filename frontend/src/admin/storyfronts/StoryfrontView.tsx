/** Discover the actual tenant-bound hosted frontends; keep the optional legacy app connector separate. */
import { useEffect, useState } from "react";
import AppFrame from "../../shared/apps/AppFrame";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import type { RequestFn } from "../shell/studio-types";
import Icon from "../../shared/ui/Icon";
import { useStoryfrontText } from "./storyfront-i18n";
import { connectionUrl, type FrontendConnection } from "./storyfront-model";
import "../styles/storyfronts.css";
export default function StoryfrontView({
  request,
  role,
}: {
  request: RequestFn;
  role: string;
}) {
  const { w, locale } = useWorkbenchText();
  const text = useStoryfrontText();
  const [app, setApp] = useState<{
    id: string;
    active: boolean;
    uiUrl?: string;
    revision: number;
  }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [frontends, setFrontends] = useState<FrontendConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const load = async () =>
    setApp(
      (await request("/api/apps")).packages.find(
        (p: { id: string }) => p.id === "storyfront",
      ),
    );
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setFrontends([]);
    setApp(undefined);
    void Promise.allSettled([
      request("/api/settings/frontends"),
      request("/api/apps"),
    ]).then(([mounted, packages]) => {
      if (!active) return;
      if (mounted.status === "fulfilled") setFrontends(mounted.value.frontends);
      if (packages.status === "fulfilled")
        setApp(
          packages.value.packages.find(
            (p: { id: string }) => p.id === "storyfront",
          ),
        );
      if (mounted.status === "rejected" || packages.status === "rejected")
        setError("load");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [request, refresh]);
  return (
    <div className="studio-page workbench">
      <div className="page-intro">
        <span className="kicker">{w("storyfronts")}</span>
        <h1>{w("storyfronts")}</h1>
        <p>{w("storyHint")}</p>
        <button
          className="studio-secondary"
          disabled={loading}
          onClick={() => setRefresh((v) => v + 1)}
        >
          <Icon name="refresh" />
          {text("refresh")}
        </button>
      </div>
      {loading ? (
        <p role="status">{text("loading")}</p>
      ) : (
        <>
          {!!frontends.length && (
            <>
              <p className="storyfront-explanation">{text("hint")}</p>
              <div className="storyfront-grid">
                {frontends.map((f) => {
                  const url = connectionUrl(f.url),
                    editor = connectionUrl(f.editorUrl, locale);
                  return (
                    <article
                      className="studio-card storyfront-card"
                      key={f.alias}
                    >
                      <div className="storyfront-card-cover">
                        <Icon name="layers" />
                        <span>{text("connected")}</span>
                      </div>
                      <div className="storyfront-card-body">
                        <h2>{f.alias}</h2>
                        <p className="storyfront-address">
                          {url ? new URL(url).hostname : f.alias}
                        </p>
                        <dl>
                          <dt>{text("channel")}</dt>
                          <dd>{f.channel}</dd>
                        </dl>
                        <div className="storyfront-card-actions">
                          {editor ? (
                            <a
                              className="studio-primary"
                              href={editor}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Icon name="settings" />
                              {text("edit")}
                            </a>
                          ) : (
                            <p>{text("editorMissing")}</p>
                          )}
                          {url && (
                            <a
                              className="studio-secondary"
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Icon name="arrow" />
                              {text("open")}
                            </a>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
          {(!frontends.length || (app?.active && app.uiUrl)) && (
            <section className="studio-card">
              {app?.active && app.uiUrl ? (
                <AppFrame app="storyfront" url={app.uiUrl} request={request} />
              ) : (
                !error && (
                  <>
                    <p>{w("storyMissing")}</p>
                    <button
                      className="studio-primary"
                      disabled={busy || !["owner", "admin"].includes(role)}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          if (app)
                            await request(
                              "/api/apps/storyfront",
                              { active: true, revision: app.revision },
                              "PUT",
                            );
                          else
                            await request("/api/apps", {
                              builtIn: "storyfront",
                            });
                          await load();
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {w("connectStory")}
                    </button>
                  </>
                )
              )}
            </section>
          )}
        </>
      )}
      {error && <p role="alert">{text("failed")}</p>}
    </div>
  );
}
