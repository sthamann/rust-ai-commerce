/** Restore native section navigation after SPA rendering, with cancellation and reduced-motion support. */
import { useEffect } from "react";
export function useStorefrontAnchors(id: string | undefined, path: string) {
  useEffect(() => {
    if (id || !["#assistant", "#collection"].includes(path)) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(path.slice(1))?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [path, id]);
}
