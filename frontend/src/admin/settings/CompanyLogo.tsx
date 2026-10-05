/** Private logo preview and bounded upload; attaching/removing is a draft change until the profile is saved. */
import { useEffect, useRef, useState } from "react";
import { useCompanyText } from "../../shared/i18n/company-i18n";
import type { RequestFn } from "../shell/studio-types";
export default function CompanyLogo({
  id,
  request,
  onChange,
  onBusyChange,
}: {
  id: string;
  request: RequestFn;
  onChange: (id: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { co } = useCompanyText(),
    current = useRef(request);
  current.current = request;
  const [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const callback = useRef(onChange);
  callback.current = onChange;
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => {
    busyCallback.current?.(busy);
    return () => {
      busyCallback.current?.(false);
    };
  }, [busy]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setPreview("");
    if (id)
      current
        .current(`/api/settings/company-logo/${id}`)
        .then((v) => {
          if (active) setPreview(v.dataUrl);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <div className="company-logo">
      <div className="company-logo-preview">
        {preview ? (
          <img src={preview} alt={co("logo")} />
        ) : (
          <span>{co("logo")}</span>
        )}
      </div>
      <div>
        <p>{co("logoHint")}</p>
        <label className="company-upload">
          {co(busy ? "uploading" : "upload")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            aria-label={co("upload")}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              e.target.value = "";
              if (
                file.size > 2 * 1024 * 1024 ||
                !["image/png", "image/jpeg", "image/webp"].includes(file.type)
              ) {
                setError(co("uploadError"));
                return;
              }
              setBusy(true);
              setError("");
              try {
                const body = new FormData();
                body.set("file", file);
                const result = await current.current(
                  "/api/settings/company-logo",
                  body,
                );
                if (alive.current) callback.current(result.id);
              } catch (e) {
                if (alive.current) setError((e as Error).message);
              } finally {
                if (alive.current) setBusy(false);
              }
            }}
          />
        </label>
        {id && (
          <button type="button" disabled={busy} onClick={() => onChange("")}>
            {co("remove")}
          </button>
        )}
        {error && (
          <p role="alert" className="settings-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
