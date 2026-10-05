/** Revisioned settings drafts survive locale refreshes, reject late loads and keep failed saves editable. */
import { useEffect, useRef, useState } from "react";
import type { RequestFn } from "../shell/studio-types";
export function useSettingsDraft<T, M extends object = object>(
  request: RequestFn,
  path: string,
) {
  const currentRequest = useRef(request);
  currentRequest.current = request;
  const [value, setValue] = useState<{ data: T; revision: number } & M>();
  const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    setValue(undefined);
    setError("");
    setSaved(false);
    currentRequest
      .current(path)
      .then((v) => {
        if (active) {
          setValue(v);
          setBaseline(JSON.stringify(v.data));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
    // Merchant's scope boundary remounts on tenant/environment changes. A new
    // locale transport must not overwrite pending edits to the same record.
  }, [path]);
  const dirty = !!value && JSON.stringify(value.data) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const change = (data: T) => {
    if (value) setValue({ ...value, data });
    setSaved(false);
  };
  const save = async () => {
    if (!value || busy || !dirty) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const result = await currentRequest.current(path, value, "PUT");
      // Keep the acknowledged revision; use canonical data when the endpoint returns it.
      const next = result.data
        ? result
        : { ...value, data: value.data, revision: result.revision };
      setValue(next);
      setBaseline(JSON.stringify(next.data));
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { value, dirty, busy, error, saved, change, save };
}
