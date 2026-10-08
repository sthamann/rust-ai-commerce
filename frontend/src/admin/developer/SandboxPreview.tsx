/** Preview resolves the installed registry first; a newer staged package cannot masquerade as an older build. */
import { useEffect, useState } from "react";
import SandboxContextPicker from "./SandboxContextPicker";
import useSurfaceGateway from "../../shared/apps/useSurfaceGateway";
import NativeAppView from "../../shared/apps/native/NativeAppView";
import type { AppSurface } from "../../shared/apps/AppSurfaces";
import type { RequestFn } from "../shell/studio-types";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
export default function SandboxPreview({
  app,
  version,
  view,
  request,
  onLanguages,
}: {
  app: string;
  version: string;
  view: string;
  request: RequestFn;
  onLanguages?: (mainLocale: string, locales: string[]) => void;
}) {
  const { a } = useAppStudioText();
  const [context, setContext] = useState<Record<string, unknown>>({});
  const [surface, setSurface] = useState<AppSurface | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setSurface(null);
    setContext({});
    setError("");
    Promise.all([
      request("/api/apps/surfaces"),
      request("/store-api/apps/surfaces"),
    ])
      .then((v) => ({ surfaces: [...v[0].surfaces, ...v[1].surfaces] }))
      .then((v) => {
        const s = v.surfaces.find(
          (s: AppSurface) =>
            s.app === app && s.version === version && s.surface.id === view,
        );
        if (active) {
          if (s?.native) {
            setSurface(s);
            onLanguages?.(s.mainLocale ?? "en-GB", s.locales ?? ["en-GB"]);
          } else setError(a("notStaged"));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request, app, version, view]);
  const scoped = useSurfaceGateway(
    request,
    app,
    view,
    context,
    !!surface && !surface.surface.location.startsWith("admin."),
  );
  return (
    <div className="app-sandbox-preview">
      <div className="app-canvas-label">
        <span>{a("realPreview")}</span>
        <span>{version}</span>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : surface?.native ? (
        <>
          {surface.native.view.blocks.find((b) => b.contextBinding)
            ?.contextBinding && (
            <SandboxContextPicker
              key={`${app}:${view}`}
              binding={
                surface.native.view.blocks.find((b) => b.contextBinding)!
                  .contextBinding!
              }
              request={request}
              mainLocale={surface.mainLocale ?? "en-GB"}
              onSelect={setContext}
            />
          )}
          <NativeAppView
            key={JSON.stringify(context)}
            context={context}
            app={app}
            native={surface.native}
            request={scoped}
            debug
            allowedActions={surface.surface.actions}
            mainLocale={surface.mainLocale}
            locales={surface.locales}
            inheritContentLanguage
            public={!surface.surface.location.startsWith("admin.")}
          />
        </>
      ) : (
        <p>{a("loading")}</p>
      )}
    </div>
  );
}
