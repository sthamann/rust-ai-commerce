/** Public attachment list follows the active storefront tenant and channel; private downloads are never listed. */
import { useState, useEffect } from "react";
import { shopApi } from "./shop-api";
import { useOperationsText } from "./operations-i18n";
import { downloadFile } from "./operation-download";
export default function ProductAttachments({ id }: { id: string }) {
  const { o, locale } = useOperationsText();
  const [files, setFiles] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    shopApi<any>(`/store-api/product/${id}/attachments`)
      .then((v) => {
        if (active) setFiles(v.elements);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, locale]);
  if (!files.length && !error) return null;
  const query = new URLSearchParams(location.search);
  return (
    <section className="shop-detail-section">
      <h2>{o("assets")}</h2>
      {files.map((f) => (
        <button
          key={f.id}
          className="shop-button"
          onClick={() =>
            void downloadFile(`/store-api/assets/${f.id}`, {
              "x-tenant": query.get("shop") ?? "atelier",
              ...(query.get("channel")
                ? { "sw-sales-channel-id": query.get("channel")! }
                : {}),
            }).catch((e) => setError(e.message))
          }
        >
          {f.title[locale.slice(0, 2)] ?? f.title.en} · {f.filename}
        </button>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
