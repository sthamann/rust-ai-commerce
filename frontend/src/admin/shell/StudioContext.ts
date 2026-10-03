/** Typed, local Studio context; never shared across a different mounted Studio. */
import { createContext, useContext } from "react";
import type { StudioController } from "./useStudioController";
export const StudioContext = createContext<StudioController | null>(null);
export function useStudio() {
  const value = useContext(StudioContext);
  if (!value) throw new Error("Studio view requires StudioContext");
  return value;
}
