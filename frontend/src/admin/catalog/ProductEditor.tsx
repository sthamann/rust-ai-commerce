/** Revision-aware product aggregate editor: one save, translation tabs and product-scoped linked capabilities. */
import { useCrmText } from "../../shared/i18n/crm-i18n";
import EntityHistory from "../../shared/history/EntityHistory";
import { ContentLanguage } from "../../shared/i18n/ContentLanguage";
import ProductEditorNav from "./ProductEditorNav";
import { useEffect, useRef, useState } from "react";
import {
  AppSurfaceSlot,
  AppSurfaceView,
  useAppSurfaces,
} from "../../shared/apps/AppSurfaces";
import type { RequestFn } from "../shell/studio-types";
import { useCatalogText } from "./catalog-i18n";
import {
  hydrateDraft,
  newDraft,
  type Category,
  type ProductDraft,
} from "./catalog-model";
import ProductMediaWorkspace from "./ProductMediaWorkspace";
import TaxClassSelect from "./TaxClassSelect";
import ProductPanels from "./ProductPanels";
import ProductAssets from "./ProductAssets";
import ReviewModeration from "./ReviewModeration";
import { EditorBuffer } from "./EditorBuffer";
import ProductVariants from "./ProductVariants";
import RelatedProducts from "./RelatedProducts";
export default function ProductEditor({
  id,
  request,
  categories,
  onBack,
  onCreated,
}: {
  id: string;
  request: RequestFn;
  categories: Category[];
  onBack: () => void;
  onCreated: (id: string) => void;
}) {
  const { c, locale } = useCatalogText();
  const appTabs = useAppSurfaces().filter(
    (s) => s.surface.location === "admin.product.tab",
  );
  const { r } = useCrmText();
  const [draft, setDraft] = useState<ProductDraft>(newDraft);
  const [reloadIndex, setReloadIndex] = useState(0);
  const [baseline, setBaseline] = useState("");
  const [lang, setLang] = useState(locale.slice(0, 2));
  const [tab, setTab] = useState("general");
  const selectedApp = appTabs.find(
    (s) => tab === `app:${s.app}:${s.surface.id}`,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editorPending, setEditorPending] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const currentRequest = useRef(request);
  currentRequest.current = request;
  useEffect(() => {
    let active = true;
    if (!id) {
      const d = newDraft();
      setDraft(d);
      setBaseline(JSON.stringify(d));
      currentRequest
        .current("/api/merchant/commerce")
        .then((v) => {
          if (active && v.data?.locales) {
            setDraft((old) => ({
              ...old,
              mainLocale: v.data.mainLocale,
              availableLocales: v.data.locales,
              translations: Object.fromEntries(
                v.data.locales.map((l: string) => {
                  const base = l.split("-")[0],
                    key =
                      v.data.locales.filter(
                        (x: string) => x.split("-")[0] === base,
                      ).length === 1
                        ? base
                        : l;
                  return [
                    key,
                    old.translations[key] ?? { name: null, description: null },
                  ];
                }),
              ),
            }));
          }
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }
    setLoading(true);
    currentRequest
      .current(`/api/merchant/products/${id}`)
      .then((v) => {
        if (active) {
          const d = hydrateDraft(v);
          setDraft(d);
          setBaseline(JSON.stringify(d));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // All translations are loaded together; a UI locale change must not
    // overwrite a draft. Merchant's boundary remounts on shop/environment changes.
  }, [id, reloadIndex]);
  const dirty = JSON.stringify(draft) !== baseline || editorPending;
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const change = (d: ProductDraft) => {
    setDraft(d);
    setSaved(false);
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const translations = { ...draft.translations };
      const {
        id: _id,
        channels: _channels,
        mainLocale: _mainLocale,
        availableLocales: _availableLocales,
        ...payload
      } = { ...draft, translations };
      const result = await request(
        id ? `/api/merchant/products/${id}` : "/api/merchant/products",
        payload,
        id ? "PUT" : "POST",
      );
      const next = {
        ...draft,
        translations,
        id: result.id,
        revision: result.revision,
      };
      setDraft(next);
      setBaseline(JSON.stringify(next));
      setSaved(true);
      if (!id) onCreated(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const enabledLocales = draft.availableLocales ?? [
    "en-GB",
    "de-DE",
    "fr-FR",
    "es-ES",
  ];
  const languageKeys = enabledLocales.map((l) =>
    enabledLocales.filter((v) => v.split("-")[0] === l.split("-")[0]).length ===
    1
      ? l.split("-")[0]
      : l,
  );
  const safeLang = languageKeys.includes(lang) ? lang : languageKeys[0];
  useEffect(() => {
    if (!languageKeys.includes(lang)) setLang(languageKeys[0]);
  }, [languageKeys.join(","), lang]);
  const tabs = [
    "general",
    "prices",
    "media",
    "variants",
    "assignments",
    "specs",
    "seo",
    "related",
    "attachments",
    "reviews",
  ] as const;
  if (loading) return <p role="status">{c("loading")}</p>;
  return (
    <ContentLanguage
      locales={languageKeys}
      mainLocale={
        languageKeys[enabledLocales.indexOf(draft.mainLocale ?? "en-GB")] ??
        languageKeys[0]
      }
      language={safeLang}
      onLanguageChange={(language) =>
        editorPending ? setError(c("unsaved")) : setLang(language)
      }
    >
      <EditorBuffer.Provider
        value={{ pending: editorPending, setPending: setEditorPending }}
      >
        <div className="studio-page catalog-workspace">
          <button
            className="catalog-back"
            onClick={() =>
              dirty || editorPending ? setLeaving(true) : onBack()
            }
          >
            ← {r("back")}
          </button>
          {leaving && (
            <div className="catalog-unsaved" role="alert">
              <strong>{c("unsaved")}</strong>
              <button
                className="studio-secondary"
                onClick={() => setLeaving(false)}
              >
                {c("continue")}
              </button>
              <button className="studio-secondary" onClick={onBack}>
                {c("discard")}
              </button>
            </div>
          )}
          <div className="catalog-heading">
            <div>
              <p className="catalog-eyebrow">
                {id ? draft.catalog.productNumber : c("newProduct")}
              </p>
              <h1>{draft.translations[lang]?.name || c("newProduct")}</h1>
              <span role="status">
                {saved
                  ? c("saved")
                  : dirty
                    ? c("unsaved")
                    : id
                      ? `# ${draft.revision}`
                      : ""}
              </span>
            </div>
            <div className="catalog-editor-actions">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={draft.catalog.active}
                  onChange={(e) =>
                    change({
                      ...draft,
                      catalog: { ...draft.catalog, active: e.target.checked },
                    })
                  }
                />
                {c("active")}
              </label>
              <button
                className="studio-primary"
                disabled={
                  busy ||
                  editorPending ||
                  (!dirty && !!id) ||
                  !draft.catalog.productNumber ||
                  !Object.values(draft.translations).some((t) => t.name?.trim())
                }
                onClick={save}
              >
                {c(busy ? "saving" : "save")}
              </button>
            </div>
          </div>
          {error && (
            <p role="alert" className="catalog-error">
              {error}
            </p>
          )}
          <div className="catalog-detail-layout">
            <ProductEditorNav
              tabs={tabs}
              tab={tab}
              id={id}
              onSelect={(next) =>
                editorPending ? setError(c("unsaved")) : setTab(next)
              }
            />
            <section
              className="studio-card catalog-detail-panel"
              role="tabpanel"
            >
              {!selectedApp && <h2>{c(tab as (typeof tabs)[number])}</h2>}
              {selectedApp ? (
                <AppSurfaceView
                  selected={selectedApp}
                  context={{ productId: id }}
                />
              ) : tab === "media" ? (
                <ProductMediaWorkspace
                  unsaved={JSON.stringify(draft) !== baseline}
                  draft={draft}
                  request={request}
                  onChange={change}
                />
              ) : tab === "attachments" ? (
                id ? (
                  <ProductAssets id={id} request={request} />
                ) : (
                  <p>{c("createFirst")}</p>
                )
              ) : tab === "reviews" ? (
                id ? (
                  <ReviewModeration productId={id} request={request} />
                ) : (
                  <p>{c("createFirst")}</p>
                )
              ) : tab === "variants" ? (
                id ? (
                  <ProductVariants
                    draft={draft}
                    dirty={dirty}
                    onChange={change}
                    request={request}
                    onOpen={(child) =>
                      dirty ? setError(c("unsaved")) : onCreated(child)
                    }
                  />
                ) : (
                  <p>{c("createFirst")}</p>
                )
              ) : tab === "related" ? (
                <RelatedProducts
                  request={request}
                  id={id}
                  value={draft.extra.crossSelling}
                  onChange={(crossSelling) =>
                    change({
                      ...draft,
                      extra: { ...draft.extra, crossSelling },
                    })
                  }
                />
              ) : (
                <ProductPanels
                  tab={tab}
                  draft={draft}
                  lang={safeLang}
                  categories={categories}
                  onChange={change}
                />
              )}
              {tab === "prices" && (
                <TaxClassSelect
                  request={request}
                  value={draft.extra.taxClassId ?? ""}
                  onChange={(taxClassId) =>
                    change({
                      ...draft,
                      extra: { ...draft.extra, taxClassId: taxClassId || null },
                    })
                  }
                />
              )}
              {id && tab === "general" && (
                <AppSurfaceSlot
                  location="admin.product.general"
                  context={{ productId: id }}
                />
              )}
              {id && !selectedApp && (
                <AppSurfaceSlot
                  location="admin.product"
                  context={{ productId: id }}
                />
              )}
            </section>
          </div>
          {id && (
            <EntityHistory
              request={request}
              entity="product"
              id={id}
              revision={draft.revision}
              dirty={dirty || busy}
              onRestored={async () => setReloadIndex((v) => v + 1)}
            />
          )}
        </div>
      </EditorBuffer.Provider>
    </ContentLanguage>
  );
}
