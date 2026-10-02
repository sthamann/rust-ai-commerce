/** Private source ingestion and explicit publication from the merchant knowledge view. */
import { useEffect, useState } from "react";
import { useWorkbenchText } from "./workbench-i18n";
import type { RequestFn } from "./studio-types";
type Document = {
  id: string;
  title: string;
  productId?: string;
  visibility: "private" | "public";
  revision: number;
  sourceType: string;
};
export default function DocumentsManager({ request }: { request: RequestFn }) {
  const { w } = useWorkbenchText();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [title, setTitle] = useState("");
  const [productId, setProduct] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () =>
    setDocuments((await request("/api/knowledge/documents")).elements);
  useEffect(() => {
    let active = true;
    request("/api/knowledge/documents")
      .then((v) => {
        if (active) setDocuments(v.elements);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  const run = async (fn: () => Promise<void>) => {
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
    <section className="studio-card workbench">
      <h2>{w("documents")}</h2>
      <p>{w("documentHint")}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (file) {
              const data = new FormData();
              data.set("file", file);
              data.set("title", title);
              if (productId) data.set("productId", productId);
              await request("/api/knowledge/documents/upload", data);
            } else
              await request("/api/knowledge/documents", {
                title,
                productId: productId || undefined,
                content,
              });
            setContent("");
          });
        }}
      >
        <div className="workbench-row">
          <label>
            {w("title")}
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            {w("product")}
            <input
              value={productId}
              onChange={(e) => setProduct(e.target.value)}
            />
          </label>
        </div>
        <label>
          {w("content")}
          <textarea
            required={!file}
            rows={5}
            maxLength={60000}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </label>
        <label>
          {w("file")}
          <input
            type="file"
            accept=".pdf,.txt,.md"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && f.size > 2 * 1024 * 1024) {
                setError(w("uploadLimit"));
                setFile(undefined);
              } else setFile(f);
            }}
          />
        </label>
        <button className="studio-primary" disabled={busy}>
          {w("upload")}
        </button>
      </form>
      {documents.map((d) => (
        <article className="developer-build" key={d.id}>
          <strong>{d.title}</strong>
          <p>
            {w(d.visibility)} · {d.productId} · {d.sourceType}
          </p>
          <div className="workbench-row">
            <button
              className="studio-secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await request(
                    `/api/knowledge/documents/${d.id}`,
                    {
                      approve: true,
                      revision: d.revision,
                      visibility:
                        d.visibility === "public" ? "private" : "public",
                    },
                    "PUT",
                  );
                })
              }
            >
              {w(d.visibility === "public" ? "unpublishDoc" : "publishDoc")}
            </button>
            <button
              className="studio-secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await request(`/api/knowledge/documents/${d.id}/index`, {});
                })
              }
            >
              {w("index")}
            </button>
          </div>
        </article>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
