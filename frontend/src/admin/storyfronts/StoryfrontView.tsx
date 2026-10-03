/** Dedicated merchant integration surface for the independently deployed Storyfront service. */
import { useEffect, useState } from "react";
import AppFrame from "../../shared/apps/AppFrame";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import type { RequestFn } from "../shell/studio-types";
export default function StoryfrontView({
  request,
  role,
}: {
  request: RequestFn;
  role: string;
}) {
  const { w } = useWorkbenchText();
  const [app, setApp] = useState<{
    id: string;
    active: boolean;
    uiUrl?: string;
    revision: number;
  }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () =>
    setApp(
      (await request("/api/apps")).packages.find(
        (p: { id: string }) => p.id === "storyfront",
      ),
    );
  useEffect(() => {
    let active = true;
    request("/api/apps")
      .then((v) => {
        if (active)
          setApp(v.packages.find((p: { id: string }) => p.id === "storyfront"));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  return (
    <div className="studio-page workbench">
      <div className="page-intro">
        <span className="kicker">{w("storyfronts")}</span>
        <h1>{w("storyfronts")}</h1>
        <p>{w("storyHint")}</p>
      </div>
      <section className="studio-card">
        {app?.active && app.uiUrl ? (
          <AppFrame app="storyfront" url={app.uiUrl} request={request} />
        ) : (
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
                  else await request("/api/apps", { builtIn: "storyfront" });
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
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </div>
  );
}
