/** Explain the server-authorized, session-bound preview and clear its HttpOnly cookie on exit. */
import { useState } from "react";
import { usePreviewText } from "./channel-preview-i18n";
export function channelPreview() {
  return new URLSearchParams(location.search).get("preview") === "1";
}
export default function ChannelPreview() {
  const t = usePreviewText();
  const [busy, setBusy] = useState(false);
  if (!channelPreview()) return null;
  return (
    <aside className="channel-preview-banner" role="status">
      <div>
        <strong>{t("title")}</strong>
        <p>{t("hint")}</p>
      </div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/channel-preview/end", {
              method: "POST",
              credentials: "same-origin",
            });
            if (!r.ok) return;
            const url = new URL(location.href);
            url.searchParams.delete("preview");
            location.replace(url.href);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("end")}
      </button>
    </aside>
  );
}
