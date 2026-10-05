/** Tenant-scoped build lifecycle; immutable saved snapshots gate sandbox previews and selected app-only releases. */
import { useEffect, useReducer, useRef, useState } from "react";
import type { RequestFn, Provider } from "../shell/studio-types";
import type { Manifest } from "../../shared/apps/native/types";
import { appText } from "../../shared/i18n/app-studio-i18n";
import { bump, compile, editHistory, template } from "./app-model";
export type Build = {
  id: string;
  environment: string;
  app: string;
  version: string;
  digest: string;
  manifest: Manifest;
  summary: Record<string, string>;
  state: "draft" | "staged";
  provider: string;
  model?: string;
};
export type Change = {
  key: string;
  digest: string;
  conflict: boolean;
  before: unknown;
  after: unknown;
};
export function useAppStudio(
  request: RequestFn,
  initialEnvironment: string,
  refresh: () => Promise<void>,
) {
  const [history, dispatch] = useReducer(editHistory, undefined, () => ({
    present: template(),
    past: [],
    future: [],
  }));
  const [env, setEnv] = useState(initialEnvironment),
    [builds, setBuilds] = useState<Build[]>([]),
    [providers, setProviders] = useState<Provider[]>([]),
    [archivedBuilds, setArchivedBuilds] = useState<Build[]>([]);
  const [locales, setLocales] = useState(["en-GB", "de-DE", "fr-FR", "es-ES"]),
    [mainLocale, setMainLocale] = useState("en-GB");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<Build | null>(null),
    [baseline, setBaseline] = useState("");
  const [change, setChange] = useState<Change | null>(null),
    [reviewed, setReviewed] = useState(false);
  const epoch = useRef(0),
    running = useRef(false);
  const load = async () => {
    const v = await request("/api/developer");
    setBuilds(v.builds);
    setArchivedBuilds(v.archivedBuilds ?? []);
    setProviders(v.providers.providers);
    setLocales(v.locales);
    setMainLocale(v.mainLocale);
  };
  useEffect(() => {
    let active = true;
    request("/api/developer")
      .then((v) => {
        if (active) {
          setBuilds(v.builds);
          setArchivedBuilds(v.archivedBuilds ?? []);
          setProviders(v.providers.providers);
          setLocales(v.locales);
          setMainLocale(v.mainLocale);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      epoch.current++;
    };
  }, [request]);
  const run = async (fn: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    const current = epoch.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      if (current === epoch.current) await load();
    } catch (e) {
      if (current === epoch.current) setError((e as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const adopt = (b: Build) => {
    const m = compile(b.manifest);
    dispatch(m);
    setSaved(b);
    setBaseline(JSON.stringify(m));
    setEnv(b.environment);
    setChange(null);
    setReviewed(false);
  };
  const manifest = history.present,
    dirty = JSON.stringify(manifest) !== baseline;
  const importVersion = async () => {
    const b = await request("/api/developer/import", {
      environment: env,
      prompt: "Visual App Studio build",
      summary: manifest.name,
      manifest,
    });
    adopt(b);
    setNotice("saved");
  };
  const stage = async (b: Build) => {
    await request(`/api/developer/builds/${b.id}/stage`, {
      approve: true,
      digest: b.digest,
    });
    adopt({ ...b, state: "staged" });
    dispatchEvent(new Event("commerce.apps.changed"));
  };
  const review = async () => {
    setChange(null);
    setReviewed(false);
    const v = await request(`/api/environments/${env}/diff`);
    setChange(
      v.changes.find((c: Change) => c.key === `app:${manifest.id}`) ?? null,
    );
    setReviewed(true);
  };
  const publish = async () => {
    if (
      !change ||
      change.conflict ||
      dirty ||
      saved?.environment !== env ||
      change.key !== `app:${manifest.id}`
    )
      return;
    await request(`/api/environments/${env}/release`, {
      approve: true,
      selections: [{ key: change.key, digest: change.digest }],
    });
    setChange(null);
    setReviewed(false);
    setNotice("released");
    dispatchEvent(new Event("commerce.apps.changed"));
  };
  const edit = (m: Manifest) => {
    // Editing a persisted snapshot starts a new version; never overwrite its package.
    dispatch(
      saved && m.version === saved.version
        ? { ...m, version: bump(saved.version) }
        : m,
    );
    if (saved) setSaved(null);
    setChange(null);
    setReviewed(false);
  };
  return {
    manifest,
    history,
    dispatch,
    edit,
    env,
    setEnv: (next: string) => {
      setEnv(next);
      setChange(null);
      setReviewed(false);
    },
    builds,
    archivedBuilds,
    archiveApp: async (app: string, archived: boolean) => {
      await request(
        `/api/developer/apps/${app}${archived ? "" : "/restore"}`,
        { approve: true },
        archived ? "DELETE" : "POST",
      );
      if (archived && manifest.id === app) {
        dispatch("reset");
        setSaved(null);
        setBaseline("");
        setChange(null);
        setReviewed(false);
      }
    },
    providers,
    locales,
    mainLocale,
    busy,
    error,
    setError,
    notice,
    saved,
    dirty,
    change,
    reviewed,
    run,
    importVersion,
    stage,
    review,
    publish,
    adopt,
    editVersion: (b: Build) => {
      edit({ ...b.manifest, version: bump(b.version) });
      setSaved(null);
      setBaseline("");
      setEnv(b.environment);
    },
    createSandbox: async (name: string) => {
      const v = await request("/api/environments", { name });
      await refresh();
      setEnv(v.id);
    },
    generate: async (prompt: string, provider: string, model: string) => {
      const b = await request("/api/developer/generate", {
        environment: env,
        prompt,
        manifest,
        inference: { provider, model },
      });
      adopt(b);
    },
    startDraft: (m: Manifest) => {
      dispatch(m);
      setSaved(null);
      setBaseline("");
      setChange(null);
      setReviewed(false);
    },
    reset: () => {
      dispatch("reset");
      setSaved(null);
      setBaseline("");
      setChange(null);
      setReviewed(false);
    },
    summary: appText("saved"),
  };
}
export type AppStudio = ReturnType<typeof useAppStudio>;
