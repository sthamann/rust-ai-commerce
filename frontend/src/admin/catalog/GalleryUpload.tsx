/** Image upload reuses bounded, validated asset storage; published URLs carry an explicit public shop scope. */
import { useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import type { ProductDraft } from "./catalog-model";
import { useCatalogText } from "./catalog-i18n";
import { useOperationsText } from "../../shared/i18n/operations-i18n";
export default function GalleryUpload({
  draft,
  request,
  onChange,
}: {
  draft: ProductDraft;
  request: RequestFn;
  onChange: (d: ProductDraft) => void;
}) {
  const { c } = useCatalogText();
  const { o } = useOperationsText();
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="catalog-gallery-upload">
      <label>
        {c("image")}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files?.[0])}
        />
      </label>
      <button
        type="button"
        className="studio-secondary"
        disabled={!file || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const body = new FormData();
            body.set("file", file!);
            body.set("kind", "attachment");
            body.set(
              "title",
              JSON.stringify(
                Object.fromEntries(
                  Object.entries(draft.translations).map(([l, t]) => [
                    l,
                    t.name || file!.name,
                  ]),
                ),
              ),
            );
            const v = await request(
              `/api/merchant/products/${draft.id}/assets`,
              body,
            );
            await request(
              `/api/merchant/assets/${v.id}`,
              { digest: v.digest, public: true },
              "PUT",
            );
            onChange({
              ...draft,
              commerce: {
                ...draft.commerce,
                media: [
                  ...draft.commerce.media,
                  {
                    id: v.id,
                    url: `/store-api/assets/${v.id}?shop=${encodeURIComponent(v.shop)}`,
                    view: file!.name,
                  },
                ],
              },
            });
            setFile(undefined);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {o("upload")}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
