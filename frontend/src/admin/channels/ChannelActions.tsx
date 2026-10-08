/** Lifecycle actions use shared dependency deletion and one-use preview admission. */
import { useState } from "react";
import AutomationDelete from "../automation/AutomationDelete";
import type { RequestFn } from "../shell/studio-types";
import { channelUrl, type Channel } from "./channel-model";
import { useChannelText } from "./channel-i18n";
import { connectionUrl } from "../storyfronts/storyfront-model";
export default function ChannelActions({
  draft,
  request,
  workspace,
  disabled,
  onToggle,
  onDeleted,
}: {
  draft: Channel;
  request: RequestFn;
  workspace: string;
  disabled: boolean;
  onToggle: () => void;
  onDeleted: () => void;
}) {
  const t = useChannelText(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const preview = async () => {
    const popup = window.open("about:blank", "_blank");
    setBusy(true);
    setError("");
    try {
      const mounts = await request("/api/settings/frontends");
      const alias = mounts.frontends?.find(
        (f: { channel: string }) => f.channel === draft.id,
      )?.alias;
      const value = await request(
        `/api/automation/channels/${encodeURIComponent(draft.id)}/preview`,
        alias ? { alias } : {},
      );
      const url = connectionUrl(value.url);
      if (!url || !popup) throw new Error();
      popup.opener = null;
      popup.location.replace(url);
    } catch {
      popup?.close();
      setError(t("previewError"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {draft.data.active && draft.data.visibility !== "private" && (
        <a
          className="studio-secondary"
          href={channelUrl(workspace, draft.id)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("preview")} ↗
        </a>
      )}
      <button
        className="studio-secondary"
        disabled={disabled || busy}
        onClick={() => void preview()}
      >
        {t("previewPrivate")} ↗
      </button>
      <button
        className="studio-secondary"
        disabled={disabled || busy}
        onClick={onToggle}
      >
        {t(draft.data.active ? "deactivate" : "activate")}
      </button>
      <AutomationDelete
        request={request}
        kind="channels"
        id={draft.id}
        revision={draft.revision}
        disabled={disabled || busy}
        onDeleted={onDeleted}
      />
      {error && <p role="alert">{error}</p>}
    </>
  );
}
