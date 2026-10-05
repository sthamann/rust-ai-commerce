/** Load enabled content languages, countries and channel choices without overwriting an edited draft on locale refresh. */
import { useEffect, useRef, useState } from "react";
import type { CountryCatalogue } from "../../shared/geography/geography-types";
import type { RequestFn } from "../shell/studio-types";
export function useCompanyContext(request: RequestFn) {
  const current = useRef(request);
  current.current = request;
  const [world, setWorld] = useState<CountryCatalogue>();
  const [channels, setChannels] = useState<
    { id: string; data: { name: Record<string, string> } }[]
  >([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      current.current("/store-api/countries"),
      current.current("/api/automation"),
    ])
      .then(([w, c]) => {
        if (!active) return;
        if (!Array.isArray(w.countries)) throw Error();
        setWorld(w);
        setChannels(c.channels ?? []);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return { world, channels, error };
}
