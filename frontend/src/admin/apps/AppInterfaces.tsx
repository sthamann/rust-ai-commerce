/** Open registered native/isolated admin surfaces through the existing permission-filtered registry. */
import StoryfrontConnections from "../storyfronts/StoryfrontConnections";
import { useState } from "react";
import {
  useAppSurfaces,
  AppSurfaceView,
  surfaceLabel,
} from "../../shared/apps/AppSurfaces";
import { useLocale } from "../../shared/i18n/i18n";
import { useLibraryText } from "../../shared/i18n/app-library-i18n";
import type { RequestFn } from "../shell/studio-types";
import type { Package } from "./app-types";
export default function AppInterfaces({
  p,
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
  return p.connections?.length ? (
    <StoryfrontConnections frontends={p.connections} />
  ) : selected ? (
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
  ) : (
    <p className="app-library-empty">{l("noInterface")}</p>
  );
}
