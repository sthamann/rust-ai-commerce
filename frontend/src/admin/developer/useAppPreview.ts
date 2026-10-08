/** F5/hot reload uses the existing native runtime in an actor-private staging environment, never an immutable build. */
import { useEffect, useRef, useState } from "react";
import type { Manifest } from "../../shared/apps/native/types";
import type { RequestFn } from "../shell/studio-types";
import { compile, problems } from "./app-model";
type Preview = {
  environment: string;
  app: string;
  version: string;
  digest: string;
};
export function useAppPreview(manifest: Manifest, request: RequestFn) {
  const [result, setResult] = useState<Preview | null>(null),
    [active, setActive] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const saved = useRef(""),
    running = useRef<number | null>(null),
    epoch = useRef(0),
    current = useRef(manifest);
  current.current = manifest;
  useEffect(() => {
    epoch.current++;
    saved.current = "";
    setResult(null);
    setActive(false);
    setBusy(false);
    setError("");
  }, [request]);
  const run = async () => {
    if (running.current === epoch.current || problems(current.current)) return;
    const value = compile(current.current),
      stamp = JSON.stringify(value),
      generation = epoch.current;
    running.current = generation;
    setBusy(true);
    setError("");
    try {
      const preview = await request("/api/developer/preview", {
        manifest: value,
      });
      if (generation === epoch.current) {
        saved.current = stamp;
        setResult(preview);
        setActive(true);
      }
    } catch (e) {
      if (generation === epoch.current) setError((e as Error).message);
    } finally {
      if (running.current === generation) running.current = null;
      if (generation === epoch.current) setBusy(false);
    }
  };
  const stamp = JSON.stringify(compile(manifest));
  useEffect(() => {
    if (!active || busy || stamp === saved.current || problems(manifest))
      return;
    const timer = setTimeout(() => void run(), 800);
    return () => clearTimeout(timer);
  }, [active, busy, stamp, request]);
  return { result, active, busy, error, run, close: () => setActive(false) };
}
