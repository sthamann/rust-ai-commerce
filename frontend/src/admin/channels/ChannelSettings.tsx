/** Channel settings embed existing revision-aware identity and checkout editors with the channel selected. */
import { useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import MasterDataSettings from "../settings/MasterDataSettings";
import CommerceSettings from "../settings/CommerceSettings";
import { useChannelText } from "./channel-i18n";
export default function ChannelSettings({
  request,
  channel,
  canWrite,
  onDirty,
}: {
  request: RequestFn;
  channel: string;
  canWrite: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  const t = useChannelText(),
    [area, setArea] = useState<"company" | "taxes" | "shipping" | "payment">(
      "company",
    ),
    [dirty, setDirty] = useState(false);
  const notify = (value: boolean) => {
    setDirty(value);
    onDirty(value);
  };
  return (
    <>
      <p>{t("scopeHint")}</p>
      <nav className="workbench-row">
        {(["company", "taxes", "shipping", "payment"] as const).map((k) => (
          <button
            key={k}
            className={k === area ? "studio-primary" : "studio-secondary"}
            disabled={dirty && k !== area}
            onClick={() => setArea(k)}
          >
            {t(k)}
          </button>
        ))}
      </nav>
      {area === "company" ? (
        <MasterDataSettings
          key={channel + area}
          request={request}
          canWrite={canWrite}
          initialChannel={channel}
          onDirty={notify}
        />
      ) : (
        <CommerceSettings
          key={channel + area}
          request={request}
          canWrite={canWrite}
          initialChannel={channel}
          area={area}
          onDirty={notify}
        />
      )}
    </>
  );
}
