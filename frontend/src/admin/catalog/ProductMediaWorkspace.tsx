/** One product-media workspace: cover, ordered gallery, multilingual image metadata, drag/drop and optional reviewed AI drafts. */
import { useRef, useState } from "react";
import LocalizedField from "../../shared/i18n/LocalizedField";
import { useContentLanguage } from "../../shared/i18n/ContentLanguage";
import { useWorkspaceText } from "../../shared/i18n/workspace-i18n";
import ConfirmDialog from "../../shared/ui/ConfirmDialog";
import type { RequestFn } from "../shell/studio-types";
import type { ProductDraft } from "./catalog-model";
import { mediaAlt, moveImage, type GalleryImage } from "./media-model";
import MediaDropzone from "./MediaDropzone";
import AiImageStudio from "./AiImageStudio";
import "../styles/media-workspace.css";
export default function ProductMediaWorkspace({
  draft,
  request,
  onChange,
  unsaved = false,
}: {
  draft: ProductDraft;
  request: RequestFn;
  onChange: (draft: ProductDraft) => void;
  unsaved?: boolean;
}) {
  const { w } = useWorkspaceText(),
    { language, mainLocale } = useContentLanguage();
  const [selected, setSelected] = useState(""),
    [removing, setRemoving] = useState(false),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState(""),
    [showUrl, setShowUrl] = useState(false);
  const current = useRef(draft);
  current.current = draft;
  const media = draft.commerce.media as GalleryImage[],
    image = media.find((m) => m.id === selected) ?? media[0];
  const change = (media: GalleryImage[]) =>
    onChange({
      ...current.current,
      commerce: { ...current.current.commerce, media },
    });
  const append = (images: GalleryImage[]) => {
    change([...current.current.commerce.media, ...images]);
    setSelected(images[0]?.id ?? "");
  };
  return (
    <section className="product-media-workspace">
      <header className="media-workspace-heading">
        <div>
          <h3>{w("gallery")}</h3>
          <p>
            {media.length}/20 · {w("cover")}
          </p>
        </div>
        <button
          type="button"
          className="studio-secondary"
          onClick={() => setShowUrl((v) => !v)}
          disabled={busy || media.length >= 20}
        >
          {w("addUrl")}
        </button>
      </header>
      {draft.id ? (
        <MediaDropzone
          id={draft.id}
          mainLocale={mainLocale}
          count={media.length}
          request={request}
          onImages={append}
          onBusy={setBusy}
        />
      ) : (
        <p>{w("uploadHint")}</p>
      )}
      {showUrl && (
        <div className="media-url-entry">
          <label>
            {w("url")}
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="studio-secondary"
            disabled={
              !url ||
              busy ||
              media.length >= 20 ||
              (!url.startsWith("/media/") &&
                !url.startsWith("/store-api/assets/") &&
                !url.startsWith("/assets/") &&
                !/^https:\/\//.test(url))
            }
            onClick={() => {
              append([{ id: crypto.randomUUID(), url, view: "", alt: {} }]);
              setUrl("");
              setShowUrl(false);
            }}
          >
            {w("addUrl")}
          </button>
        </div>
      )}
      {!media.length ? (
        <div className="media-empty">
          <span aria-hidden="true">◇</span>
          <h3>{w("noImages")}</h3>
          <p>{w("placeholder")}</p>
        </div>
      ) : (
        <div className="media-gallery">
          <div className="media-image-grid">
            {media.map((m, n) => (
              <button
                type="button"
                className={`media-tile ${image?.id === m.id ? "is-selected" : ""}`}
                key={m.id}
                aria-label={mediaAlt(m, language, mainLocale) || `${n + 1}`}
                aria-pressed={image?.id === m.id}
                onClick={() => setSelected(m.id)}
              >
                <img
                  src={m.url}
                  alt={mediaAlt(m, language, mainLocale)}
                  loading="lazy"
                />
                {n === 0 && (
                  <span className="media-cover-tag">{w("cover")}</span>
                )}
                <span className="media-tile-caption">
                  {mediaAlt(m, language, mainLocale) || `${n + 1}`}
                </span>
              </button>
            ))}
          </div>
          {image && (
            <aside className="media-inspector">
              <img
                src={image.url}
                alt={mediaAlt(image, language, mainLocale)}
              />
              <LocalizedField
                label={w("alt")}
                maxLength={100}
                value={image.alt ?? { [mainLocale]: image.view }}
                onChange={(alt) =>
                  change(
                    media.map((m) => (m.id === image.id ? { ...m, alt } : m)),
                  )
                }
              />
              <label>
                {w("url")}
                <input
                  value={image.url}
                  onChange={(e) =>
                    change(
                      media.map((m) =>
                        m.id === image.id ? { ...m, url: e.target.value } : m,
                      ),
                    )
                  }
                />
              </label>
              <div className="media-actions">
                <button
                  type="button"
                  className="studio-secondary"
                  disabled={media[0].id === image.id || busy}
                  onClick={() =>
                    change(moveImage(media, media.indexOf(image), 0))
                  }
                >
                  {w("makeCover")}
                </button>
                {([-1, 1] as const).map((delta) => (
                  <button
                    type="button"
                    className="studio-secondary"
                    key={delta}
                    disabled={
                      busy ||
                      media.indexOf(image) + delta < 0 ||
                      media.indexOf(image) + delta >= media.length
                    }
                    onClick={() =>
                      change(
                        moveImage(
                          media,
                          media.indexOf(image),
                          media.indexOf(image) + delta,
                        ),
                      )
                    }
                  >
                    {w(delta < 0 ? "previous" : "next")}
                  </button>
                ))}
                <button
                  type="button"
                  className="studio-secondary"
                  disabled={busy}
                  onClick={() => setRemoving(true)}
                >
                  {w("confirm")}
                </button>
              </div>
            </aside>
          )}
        </div>
      )}
      {draft.id && (
        <AiImageStudio
          productId={draft.id}
          revision={draft.revision}
          sourceId={image?.id}
          request={request}
          onImage={(m) => append([m])}
          disabled={busy || unsaved || media.length >= 20}
        />
      )}
      {removing && image && (
        <ConfirmDialog
          title={w("deleteTitle")}
          onCancel={() => setRemoving(false)}
          onConfirm={() => {
            change(media.filter((m) => m.id !== image.id));
            setSelected("");
            setRemoving(false);
          }}
        >
          <p>{w("deleteHint")}</p>
          <img
            className="media-delete-preview"
            src={image.url}
            alt={mediaAlt(image, language, mainLocale)}
          />
        </ConfirmDialog>
      )}
    </section>
  );
}
