/** Optional external video is not contacted until the same shop privacy choice allows it. */
import { usePurpose, openConsent } from "./consent-store";
import { useLegalText } from "../i18n/legal-i18n";
export default function ExternalVideo({
  url,
  label,
}: {
  url: string;
  label?: string;
}) {
  const allowed = usePurpose("externalMedia"),
    { l } = useLegalText();
  const external = new URL(url, location.origin).origin !== location.origin;
  return external && !allowed ? (
    <button className="shop-secondary" type="button" onClick={openConsent}>
      {l("loadMedia")}
    </button>
  ) : (
    <video controls preload="none" src={url} aria-label={label} />
  );
}
