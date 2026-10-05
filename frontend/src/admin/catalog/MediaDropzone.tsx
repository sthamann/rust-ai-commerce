/** Accessible multi-file upload with drag/drop, visible progress and the same validated asset API as attachments. */
import { useRef, useState } from "react";
import { useWorkspaceText } from "../../shared/i18n/workspace-i18n";
import type { RequestFn } from "../shell/studio-types";
import { validImages, type GalleryImage } from "./media-model";
export default function MediaDropzone({
  id,
  mainLocale,
  count,
  request,
  onImages,
  onBusy,
}: {
  id: string;
  mainLocale: string;
  count: number;
  request: RequestFn;
  onImages: (images: GalleryImage[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const { w } = useWorkspaceText();
  const input = useRef<HTMLInputElement>(null),
    [drag, setDrag] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState("");
  const busy = useRef(false);
  const callback = useRef(onImages);
  callback.current = onImages;
  const upload = async (files: File[]) => {
    if (busy.current) return;
    if (!validImages(files, count)) {
      setError(w("invalidImage"));
      return;
    }
    busy.current = true;
    onBusy(true);
    setError("");
    const images: GalleryImage[] = [];
    try {
      for (const [n, file] of files.entries()) {
        setProgress(
          `${w("uploading")} ${n + 1}/${files.length} · ${file.name}`,
        );
        const body = new FormData();
        body.set("file", file);
        body.set("kind", "attachment");
        body.set("title", JSON.stringify({ [mainLocale]: file.name }));
        const v = await request(
          `/api/merchant/products/${encodeURIComponent(id)}/assets`,
          body,
        );
        await request(
          `/api/merchant/assets/${v.id}`,
          { digest: v.digest, public: true },
          "PUT",
        );
        images.push({
          id: v.id,
          url: `/store-api/assets/${v.id}?shop=${encodeURIComponent(v.shop)}`,
          view: "",
          alt: { [mainLocale]: file.name.slice(0, 100) },
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (images.length) callback.current(images);
      setProgress("");
      busy.current = false;
      onBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div
      className={`media-dropzone ${drag ? "is-dragging" : ""}`}
      aria-busy={!!progress}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy.current) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void upload([...e.dataTransfer.files]);
      }}
    >
      <span className="media-drop-icon" aria-hidden="true">
        ↥
      </span>
      <strong>{w("drop")}</strong>
      <p>{w("uploadHint")}</p>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => void upload([...(e.target.files ?? [])])}
      />
      <button
        type="button"
        className="studio-primary"
        disabled={!!progress}
        onClick={() => input.current?.click()}
      >
        {w("choose")}
      </button>
      {progress && <p role="status">{progress}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
