/** Open registered native/isolated admin surfaces through the existing permission-filtered registry. */
import { useState } from "react";
import {
  useAppSurfaces,
  AppSurfaceView,
  surfaceLabel,
} from "../../shared/apps/AppSurfaces";
import AppFrame from "../../shared/apps/AppFrame";
import { useLocale } from "../../shared/i18n/i18n";
import { useLibraryText } from "../../shared/i18n/app-library-i18n";
import type { RequestFn } from "../shell/studio-types";
import type { Package } from "./app-types";
export default function AppInterfaces({
  p,
  request,
}: {
  p: Package;
  request: RequestFn;
}) {
  const surfaces = useAppSurfaces().filter(
    (s) => s.app === p.id && s.surface.location.startsWith("admin."),
  );
  const [id, setId] = useState("");
  const { locale } = useLocale(),
    l = useLibraryText();
  const selected = surfaces.find((s) => s.surface.id === id) ?? surfaces[0];
  return selected ? (
    <div className="app-interface-content">
      <div className="app-detail-tabs">
        {surfaces.map((s) => (
          <button
            key={s.surface.id}
            aria-pressed={s === selected}
            onClick={() => setId(s.surface.id)}
          >
            {surfaceLabel(s, locale)}
          </button>
        ))}
      </div>
      <AppSurfaceView selected={selected} />
    </div>
  ) : p.uiUrl ? (
    <AppFrame app={p.id} url={p.uiUrl} request={request} />
  ) : (
    <p className="app-library-empty">{l("noInterface")}</p>
  );
}
