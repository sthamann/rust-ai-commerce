/** Invalid local expressions block apply and mode changes until corrected; multiple editors report independently. */
import { createContext, useContext } from "react";
export const AppCodeBuffer = createContext<
  (id: string, invalid: boolean) => void
>(() => {});
export const useAppCodeBuffer = () => useContext(AppCodeBuffer);
