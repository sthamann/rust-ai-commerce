/** Bounded upload and explicit digest-bound publication of attachments and paid files. */
import { useState, useEffect, useCallback } from "react";
import type { RequestFn } from "./studio-types";
import { useOperationsText } from "./operations-i18n";
export default function ProductAssets({
  id,
  request,
}: {
  id: string;
  request: RequestFn;
}) {
  const { o } = useOperationsText();
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    async () =>
      setRows((await request(`/api/merchant/products/${id}/assets`)).elements),
    [id, request],
  );
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="studio-card">
      <h2>{o("assets")}</h2>
      <p>{o("digitalHint")}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const title = Object.fromEntries(
            ["en", "de", "fr", "es"].map((l) => [l, data.get(l)]),
          );
          for (const l of ["en", "de", "fr", "es"]) data.delete(l);
          data.set("title", JSON.stringify(title));
          void run(() => request(`/api/merchant/products/${id}/assets`, data));
        }}
      >
        {["en", "de", "fr", "es"].map((lang) => (
          <label key={lang}>
            {o("name")} · {lang.toUpperCase()}
            <input name={lang} maxLength={200} required />
          </label>
        ))}
        <label>
          {o("assets")}
          <input
            name="file"
            type="file"
            required
            accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.zip,.mp4"
          />
        </label>
        <label>
          {o("assets")}
          <select name="kind">
            <option value="attachment">{o("attachment")}</option>
            <option value="download">{o("download")}</option>
          </select>
        </label>
        <button className="studio-primary" disabled={busy}>
          {o("upload")}
        </button>
      </form>
      {rows.map((r) => (
        <div className="operation-row" key={r.id}>
          <strong>{r.filename}</strong>
          <span>
            {o(r.kind)} · {(r.bytes / 1024).toFixed(1)} KB
          </span>
          <button
            className="studio-secondary"
            disabled={busy}
            onClick={() =>
              run(() =>
                request(
                  `/api/merchant/assets/${r.id}`,
                  { digest: r.digest, public: !r.public },
                  "PUT",
                ),
              )
            }
          >
            {o(r.public ? "unpublish" : "publish")}
          </button>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
