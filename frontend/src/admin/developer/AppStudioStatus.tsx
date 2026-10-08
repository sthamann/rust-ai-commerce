/** Shared status footer keeps validation, persistence and execution feedback beside the designer. */
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import type { useAppStudio } from "./useAppStudio";
import { problems } from "./app-model";
export default function AppStudioStatus({
  studio,
  preview,
}: {
  studio: ReturnType<typeof useAppStudio>;
  preview: { busy: boolean; error: string };
}) {
  const { a } = useAppStudioText(),
    { w } = useWorkbenchText();
  return (
    <>
      {preview.error && (
        <p className="app-error" role="alert">
          {preview.error}
        </p>
      )}
      {(preview.busy || studio.busy) && (
        <p className="app-notice" role="status">
          {a("loading")}
        </p>
      )}
      {problems(studio.manifest) && <p role="alert">{a("invalid")}</p>}
      {studio.draftStorage.error && (
        <p className="app-error" role="alert">
          {a("autosaveError")} · {studio.draftStorage.error}
        </p>
      )}
      {studio.error && (
        <p className="app-error" role="alert">
          {studio.error}
        </p>
      )}
      {studio.notice && (
        <p className="app-notice" role="status">
          {studio.notice === "released" ? w("released") : a("saved")}
        </p>
      )}
    </>
  );
}
