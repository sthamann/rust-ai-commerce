/** Local storefront context, scoped to the mounted tenant and sales channel. */
import { createContext, useContext } from "react";
import type { StorefrontController } from "./useStorefrontController";
export const StorefrontContext = createContext<StorefrontController | null>(
  null,
);
export function useStorefront() {
  const c = useContext(StorefrontContext);
  if (!c) throw Error("Storefront view requires StorefrontContext");
  return c;
}
