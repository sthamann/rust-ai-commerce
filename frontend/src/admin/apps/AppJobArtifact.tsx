/** Completed app exports read the existing tenant asset owner; private files never acquire a public URL. */
import { useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import { useAppOperationsText } from "../../shared/i18n/app-operations-i18n";
export default function AppJobArtifact({
  app,
  result,
  request,
}: {
  app: string;
  result: unknown;
  request: RequestFn;
}) {
  const t = useAppOperationsText(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const id =
    result &&
    typeof result === "object" &&
    "assetId" in result &&
    typeof result.assetId === "string"
      ? result.assetId
      : null;
  if (!id) return null;
  return (
    <div>
      <button
        type="button"
        className="studio-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const value = await request(`/api/apps/${app}/core/asset`, { id });
            const bytes = Uint8Array.from(atob(value.base64), (c) =>
              c.charCodeAt(0),
            );
            const url = URL.createObjectURL(
                new Blob([bytes], { type: "application/octet-stream" }),
              ),
              link = document.createElement("a");
            link.href = url;
            link.download = value.filename;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("download")}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
