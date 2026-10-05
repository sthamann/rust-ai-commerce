/** Public attachment list follows the active storefront tenant and channel; private downloads are never listed. */
import { shopScope } from "../../shared/api/shop-scope";
import { useEffect, useState } from "react";
import { downloadFile } from "../../shared/api/download";
import { shopApi } from "../../shared/api/shop-api";
import { useOperationsText } from "../../shared/i18n/operations-i18n";
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
              "x-tenant": shopScope(),
              ...(query.get("channel")
                ? { "sw-sales-channel-id": query.get("channel")! }
                : {}),
            }).catch((e) => setError(e.message))
          }
        >
          {f.name ?? f.title[locale.slice(0, 2)] ?? f.title.en} · {f.filename}
        </button>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
