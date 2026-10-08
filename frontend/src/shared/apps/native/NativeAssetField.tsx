/** Searchable tenant-owned files with private image preview and contextual multipart upload; no raw asset IDs need to be typed. */
import { useEffect, useState } from "react";
import { useNativeRuntime } from "./NativeRuntime";
import { useContentLanguage } from "../../i18n/ContentLanguage";
import { contentText } from "../../i18n/content-language";
import { useAppStudioText } from "../../i18n/app-studio-i18n";
import type { Field } from "./types";
type Asset = {
  id: string;
  filename: string;
  mime: string;
  productId: string;
  public: boolean;
};
export default function NativeAssetField({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const runtime = useNativeRuntime(),
    { a, locale } = useAppStudioText(),
    { mainLocale } = useContentLanguage();
  const [rows, setRows] = useState<Asset[]>([]),
    [cursor, setCursor] = useState<string>(),
    [query, setQuery] = useState(""),
    [image, setImage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async (after?: string) => {
    if (!runtime) return;
    setBusy(true);
    setError("");
    try {
      const result = await runtime.assets("assets", {
        ...(runtime.productId ? { productId: runtime.productId } : {}),
        ...(after ? { after } : {}),
      });
      setRows((old) =>
        after ? [...old, ...result.elements] : result.elements,
      );
      setCursor(result.nextCursor ?? undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, [runtime?.productId]);
  useEffect(() => {
    let cancelled = false;
    setImage("");
    if (value && field.kind === "image")
      void runtime
        ?.assets("asset_preview", {
          id: String(value),
          ...(runtime.productId ? { productId: runtime.productId } : {}),
        })
        .then((v) => {
          if (!cancelled) setImage(`data:${v.mime};base64,${v.base64}`);
        })
        .catch((e) => {
          if (!cancelled) setError((e as Error).message);
        });
    return () => {
      cancelled = true;
    };
  }, [value, field.kind, runtime?.productId]);
  const filtered = rows.filter(
    (r) =>
      (field.kind !== "image" || r.mime.startsWith("image/")) &&
      r.filename.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <fieldset className="native-asset-field">
      <legend>
        {contentText(field.label, locale, mainLocale) || field.name}
      </legend>
      {image && <img src={image} alt="" className="native-asset-preview" />}
      <label>
        {a("searchAssets")}
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <select
        required={field.required}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">—</option>
        {!!value && !filtered.some((r) => r.id === value) && (
          <option value={String(value)}>{String(value)}</option>
        )}
        {filtered.map((r) => (
          <option key={r.id} value={r.id}>
            {r.filename} · {r.public ? a("publishedAsset") : a("privateAsset")}
          </option>
        ))}
      </select>
      {cursor && rows.length < 1000 && (
        <button type="button" disabled={busy} onClick={() => void load(cursor)}>
          {a("moreAssets")}
        </button>
      )}
      {runtime?.productId ? (
        <label>
          {a("uploadAsset")}
          <input
            type="file"
            disabled={busy}
            accept={
              field.kind === "image"
                ? "image/png,image/jpeg,image/webp"
                : undefined
            }
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 8 * 1024 * 1024) {
                setError(a("assetUploadLimit"));
                return;
              }
              setBusy(true);
              try {
                const body = new FormData();
                body.set("productId", runtime.productId!);
                body.set("file", file);
                body.set("kind", "attachment");
                body.set(
                  "title",
                  JSON.stringify({ [mainLocale]: file.name.slice(0, 180) }),
                );
                const r = await runtime.assets("asset_upload", body);
                onChange(r.id);
                await load();
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </label>
      ) : (
        <p>{a("assetUploadContext")}</p>
      )}
      <p>{a("assetPublicationHint")}</p>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
