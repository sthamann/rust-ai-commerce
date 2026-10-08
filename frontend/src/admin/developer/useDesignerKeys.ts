/** Designer keyboard shortcuts leave native input and rich-editor undo behavior intact. */
import { useEffect } from "react";
export function useDesignerKeys(
  enabled: boolean,
  run: () => Promise<void>,
  showPreview: () => void,
  dispatch: (action: "undo" | "redo") => void,
) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!enabled) return;
      if (event.key === "F5") {
        event.preventDefault();
        showPreview();
        void run();
      }
      if (event.key === "F4") {
        event.preventDefault();
        document
          .querySelector<HTMLInputElement>(".app-inspector input")
          ?.focus();
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("input,textarea,[contenteditable]")
        )
      ) {
        event.preventDefault();
        dispatch(event.shiftKey ? "redo" : "undo");
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [enabled, run, showPreview, dispatch]);
}
