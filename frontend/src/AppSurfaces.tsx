/** One registry read per workspace; app bundles load only when their surface is mounted. */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AppFrame from "./AppFrame";
import Icon from "./Icon";
import { useLocale } from "./i18n";
import type { RequestFn } from "./studio-types";
import "./app-surfaces.css";
export type AppSurface = {
  app: string;
  version: string;
  url: string;
  surface: {
    id: string;
    location: string;
    label: Record<string, string>;
    actions: string[];
  };
};
const Registry = createContext<{
  surfaces: AppSurface[];
  request: RequestFn;
  public: boolean;
}>({ surfaces: [], request: async () => {}, public: true });
export function AppSurfaceProvider({
  request,
  scopeKey,
  public: isPublic = false,
  children,
}: {
  request: RequestFn;
  scopeKey: string;
  public?: boolean;
  children: ReactNode;
}) {
  const [surfaces, setSurfaces] = useState<AppSurface[]>([]);
  const latest = useRef(request);
  latest.current = request;
  useEffect(() => {
    let active = true;
    setSurfaces([]);
    const refresh = () =>
      latest
        .current(`${isPublic ? "/store-api" : "/api"}/apps/surfaces`)
        .then((v) => {
          if (active) setSurfaces(v.surfaces);
        })
        .catch(() => {
          if (active) setSurfaces([]);
        });
    void refresh();
    addEventListener("commerce.apps.changed", refresh);
    return () => {
      active = false;
      removeEventListener("commerce.apps.changed", refresh);
    };
  }, [scopeKey, isPublic]);
  return (
    <Registry.Provider value={{ surfaces, request, public: isPublic }}>
      {children}
    </Registry.Provider>
  );
}
export function surfaceLabel(s: AppSurface, locale: string) {
  return (
    s.surface.label[locale.slice(0, 2)] ?? s.surface.label.en ?? s.surface.id
  );
}
export function AdminAppNavigation({
  selected,
  onSelect,
}: {
  selected: AppSurface | null;
  onSelect: (s: AppSurface) => void;
}) {
  const { surfaces } = useContext(Registry);
  const { locale } = useLocale();
  return (
    <>
      {surfaces
        .filter((s) => s.surface.location === "admin.navigation")
        .map((s) => (
          <button
            key={`${s.app}:${s.surface.id}`}
            aria-current={
              selected?.app === s.app && selected.surface.id === s.surface.id
                ? "page"
                : undefined
            }
            className={
              selected?.app === s.app && selected.surface.id === s.surface.id
                ? "active"
                : ""
            }
            onClick={() => onSelect(s)}
          >
            <Icon name="box" />
            <span>{surfaceLabel(s, locale)}</span>
          </button>
        ))}
    </>
  );
}
export function AppSurfaceView({
  selected,
  context = {},
}: {
  selected: AppSurface;
  context?: Record<string, unknown>;
}) {
  const { request, public: isPublic, surfaces } = useContext(Registry);
  const { locale } = useLocale();
  const s = surfaces.find(
    (s) => s.app === selected.app && s.surface.id === selected.surface.id,
  );
  if (!s) return null; // Deactivation or loss of permission unmounts the guest immediately after registry refresh.
  const scoped: RequestFn = (path, body) =>
    request(path.replace("/api/", isPublic ? "/store-api/" : "/api/"), body);
  return (
    <section
      className="app-surface"
      data-app={s.app}
      data-surface={s.surface.id}
    >
      <div className="app-surface-heading">
        <h2>{surfaceLabel(s, locale)}</h2>
        <span>
          {s.app} · {s.version}
        </span>
      </div>
      <AppFrame
        app={s.app}
        url={s.url}
        request={scoped}
        allowedActions={s.surface.actions}
        context={{
          ...context,
          surface: s.surface.id,
          location: s.surface.location,
        }}
      />
    </section>
  );
}
export function AppSurfaceSlot({
  location,
  context,
}: {
  location: string;
  context?: Record<string, unknown>;
}) {
  const { surfaces } = useContext(Registry);
  return (
    <>
      {surfaces
        .filter((s) => s.surface.location === location)
        .map((s) => (
          <AppSurfaceView
            key={`${s.app}:${s.surface.id}`}
            selected={s}
            context={context}
          />
        ))}
    </>
  );
}
export function StorefrontAppNavigation() {
  const { surfaces } = useContext(Registry);
  const { locale } = useLocale();
  return (
    <>
      {surfaces
        .filter((s) => s.surface.location === "storefront.page")
        .map((s) => (
          <a
            key={`${s.app}:${s.surface.id}`}
            href={`#app/${s.app}/${s.surface.id}`}
          >
            {surfaceLabel(s, locale)}
          </a>
        ))}
    </>
  );
}
export function StorefrontAppPage({ path }: { path: string }) {
  const { surfaces } = useContext(Registry);
  const selected = surfaces.find(
    (s) =>
      `#app/${s.app}/${s.surface.id}` === path &&
      s.surface.location === "storefront.page",
  );
  return selected ? (
    <main className="shop-content">
      <AppSurfaceView selected={selected} />
    </main>
  ) : null;
}
