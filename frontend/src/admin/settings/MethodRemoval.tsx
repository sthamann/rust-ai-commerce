/** Dependency preflight is advisory; aggregate save repeats it under the checkout configuration lock. */
import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "../../shared/ui/ConfirmDialog";
import { useWorkspaceText } from "../../shared/i18n/workspace-i18n";
import type { RequestFn } from "../shell/studio-types";
export default function MethodRemoval({
  area,
  id,
  request,
  onCancel,
  onRemove,
  onDeactivate,
}: {
  area: "shipping" | "payment";
  id: string;
  request: RequestFn;
  onCancel: () => void;
  onRemove: () => void;
  onDeactivate: () => void;
}) {
  const { w } = useWorkspaceText();
  const [usage, setUsage] = useState<{
    canDelete: boolean;
    orders: number;
    carts: number;
    overrides: number;
    rules: number;
  }>();
  const [error, setError] = useState("");
  const current = useRef(request);
  current.current = request;
  useEffect(() => {
    let active = true;
    current
      .current(
        `/api/merchant/commerce/methods/${area === "shipping" ? "shipping" : "payments"}/${encodeURIComponent(id)}/dependencies`,
      )
      .then((v) => {
        if (active) setUsage(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [area, id]);
  return (
    <ConfirmDialog
      title={w("deleteTitle")}
      onCancel={onCancel}
      onConfirm={usage?.canDelete ? onRemove : onDeactivate}
      confirmLabel={w(usage?.canDelete ? "confirm" : "deactivate")}
      disabled={!usage || !!error}
    >
      <p>{w(usage && !usage.canDelete ? "blocked" : "deleteHint")}</p>
      {error ? (
        <p role="alert">{error}</p>
      ) : !usage ? (
        <p role="status">{w("checking")}</p>
      ) : (
        <dl>
          {(["orders", "carts", "overrides", "rules"] as const).map((k) => (
            <span style={{ display: "contents" }} key={k}>
              <dt>{w(k)}</dt>
              <dd>{usage[k] ?? 0}</dd>
            </span>
          ))}
        </dl>
      )}
    </ConfirmDialog>
  );
}
