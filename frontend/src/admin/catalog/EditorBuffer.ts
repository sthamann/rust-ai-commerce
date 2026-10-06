/** Unsaved Markdown source participates in the aggregate's save/navigation guard without becoming product content. */
import { createContext, useContext } from "react";
export const EditorBuffer = createContext<{
  pending: boolean;
  setPending: (pending: boolean) => void;
}>({ pending: false, setPending: () => {} });
export const useEditorBuffer = () => useContext(EditorBuffer);
