/** All four product translations and extra fields are edited together under a product revision. */
import ReviewModeration from "./ReviewModeration";
import { AppSurfaceSlot } from "../../shared/apps/AppSurfaces";

import { useEffect, useState } from "react";
import { useOperationsText } from "../../shared/i18n/operations-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import type { RequestFn } from "../shell/studio-types";
import ProductAssets from "./ProductAssets";
import RichEditor from "./RichEditor";
export default function ProductDataView({ request }: { request: RequestFn }) {
  const { o } = useOperationsText();
  const { w } = useWorkbenchText();
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [id, setId] = useState("");
  const [revision, setRevision] = useState(0);
  const [translations, setTranslations] = useState<
    Record<string, { name: string; description: string }>
  >({});
  const [extra, setExtra] = useState<any>({
    seo: {},
    specifications: {},
    crossSelling: [],
    shippingFree: false,
  });
  const [specText, setSpecText] = useState("{}");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    request("/api/search/product", {})
      .then((v) => {
        if (active) {
          setProducts(v.elements);
          setId(v.elements[0]?.id ?? "");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  useEffect(() => {
    let active = true;
    if (!id) return;
    request(`/api/merchant/products/${id}`)
      .then((v) => {
        if (active) {
          setRevision(v.revision);
          setTranslations(v.translations);
          setExtra({
            seo: {},
            specifications: {},
            crossSelling: [],
            shippingFree: false,
            ...v.extra,
          });
          setSpecText(JSON.stringify(v.extra?.specifications ?? {}, null, 2));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, request]);
  return (
    <div className="studio-page workbench">
      <div className="page-intro">
        <h1>{w("productData")}</h1>
        <p>{w("productDataHint")}</p>
      </div>
      <section className="studio-card">
        <label>
          {w("product")}
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const v = await request(
                `/api/merchant/products/${id}`,
                {
                  revision,
                  translations,
                  extra: { ...extra, specifications: JSON.parse(specText) },
                },
                "PUT",
              );
              setRevision(v.revision);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {Object.entries(translations).map(([lang, tr]) => (
            <fieldset key={lang}>
              <legend>{lang.toUpperCase()}</legend>
              <label>
                {w("title")}
                <input
                  required
                  value={tr.name}
                  onChange={(e) =>
                    setTranslations({
                      ...translations,
                      [lang]: { ...tr, name: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                {w("description")}
                <textarea
                  value={tr.description}
                  onChange={(e) =>
                    setTranslations({
                      ...translations,
                      [lang]: { ...tr, description: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                {w("seo")}
                <input
                  aria-label={`${w("seo")} ${lang}`}
                  placeholder={w("title")}
                  value={extra.seo?.[lang]?.title ?? ""}
                  onChange={(e) =>
                    setExtra({
                      ...extra,
                      seo: {
                        ...extra.seo,
                        [lang]: {
                          title: e.target.value,
                          description:
                            extra.seo?.[lang]?.description ?? tr.description,
                          slug: extra.seo?.[lang]?.slug ?? id,
                        },
                      },
                    })
                  }
                />
              </label>
            </fieldset>
          ))}
          <label>
            {w("crossSelling")}
            <input
              value={extra.crossSelling.join(", ")}
              onChange={(e) =>
                setExtra({
                  ...extra,
                  crossSelling: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={extra.shippingFree}
              onChange={(e) =>
                setExtra({ ...extra, shippingFree: e.target.checked })
              }
            />
            {w("shippingFree")}
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={extra.digital ?? false}
              onChange={(e) =>
                setExtra({ ...extra, digital: e.target.checked })
              }
            />
            {o("digital")}
          </label>
          <RichEditor
            value={extra.richDescription ?? {}}
            onChange={(richDescription) =>
              setExtra({ ...extra, richDescription })
            }
          />
          <AppSurfaceSlot
            location="admin.product"
            context={{ productId: id }}
          />
          <details>
            <summary>{w("specifications")}</summary>
            <textarea
              rows={10}
              value={specText}
              onChange={(e) => setSpecText(e.target.value)}
            />
          </details>
          <button className="studio-primary" disabled={busy}>
            {w("save")}
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
      </section>
      {id && <ProductAssets id={id} request={request} />}
      {id && <ReviewModeration productId={id} request={request} />}
    </div>
  );
}
