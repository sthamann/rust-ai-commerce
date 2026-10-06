/** Paid download entitlements are fetched by the server and retrieved with customer headers, never URL tokens. */
import { useAccountText } from "../../shared/i18n/account-i18n";
import type { CustomerDownload } from "./account-types";
export default function AccountDownloads({
  downloads,
  busy,
  download,
  onOrder,
}: {
  downloads: CustomerDownload[];
  busy: boolean;
  download: (path: string) => Promise<void>;
  onOrder: (id: string) => void;
}) {
  const { a, locale } = useAccountText();
  return (
    <section className="account-downloads">
      <p className="account-muted">{a("downloadsHint")}</p>
      {!downloads.length ? (
        <div className="account-empty">
          <span aria-hidden="true">↓</span>
          <h3>{a("noDownloads")}</h3>
          <p>{a("noDownloadsHint")}</p>
        </div>
      ) : (
        downloads.map((d) => (
          <article className="account-file" key={`${d.orderId}-${d.id}`}>
            <span className="account-file-icon" aria-hidden="true">
              ↓
            </span>
            <div>
              <strong>
                {d.title?.[locale.slice(0, 2)] ??
                  d.title?.en ??
                  d.name ??
                  d.filename}
              </strong>
              <small>{d.filename}</small>
              <button
                className="account-text-button"
                onClick={() => onOrder(d.orderId)}
              >
                {a("viewOrder")}
              </button>
            </div>
            <button
              className="shop-secondary"
              disabled={busy}
              onClick={() =>
                void download(
                  `/store-api/orders/${encodeURIComponent(d.orderId)}/downloads/${encodeURIComponent(d.id)}`,
                )
              }
            >
              {a("download")}
            </button>
          </article>
        ))
      )}
    </section>
  );
}
