/** Request-scoped geography loading; stale requests cannot move country definitions across shops or sandboxes. */
import { useEffect, useRef, useState } from "react";
import { shopApi } from "../api/shop-api";
import type { CountryCatalogue } from "./geography-types";
export type GeographyRequest = (path: string) => Promise<any>;
export function useCountryCatalogue(request: GeographyRequest = shopApi) {
  const [data, setData] = useState<CountryCatalogue>();
  const current = useRef(request);
  current.current = request;
  const scope = `${location.search}:${sessionStorage.getItem("rac-user-token") ?? ""}`;
  useEffect(() => {
    let active = true;
    setData(undefined);
    current
      .current("/store-api/countries")
      .then((v) => {
        if (active && Array.isArray(v.countries)) setData(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [scope, request]);
  return data;
}
