/** Native commerce, media, translated SEO/specifications and category panels for one editable product. */
import { useCatalogText, type CatalogWord } from "./catalog-i18n";
import type { Category, ProductDraft } from "./catalog-model";
import PairFields from "./PairFields";
import ReferencePriceFields from "./ReferencePriceFields";
import ProductMedia from "./ProductMedia";
import RichEditor from "./RichEditor";
export default function ProductPanels({
  tab,
  draft,
  lang,
  categories,
  onChange,
}: {
  tab: string;
  draft: ProductDraft;
  lang: string;
  categories: Category[];
  onChange: (d: ProductDraft) => void;
}) {
  const { c } = useCatalogText();
  const d = draft;
  const field = (key: string, label: CatalogWord, optional = false) => (
    <label key={key}>
      {c(label)}
      <input
        type="number"
        min={0}
        step={
          key === "price" || key === "taxRate" || key === "listPrice"
            ? "0.01"
            : "1"
        }
        value={d.commerce[key] ?? ""}
        onChange={(e) =>
          onChange({
            ...d,
            commerce: {
              ...d.commerce,
              [key]:
                optional && e.target.value === ""
                  ? null
                  : Number(e.target.value),
            },
          })
        }
      />
    </label>
  );
  const extra = (v: any) => onChange({ ...d, extra: { ...d.extra, ...v } });
  if (tab === "general")
    return (
      <>
        <div className="catalog-form-grid">
          <label>
            {c("name")} · {lang.toUpperCase()}
            <input
              required
              maxLength={200}
              value={d.translations[lang].name}
              onChange={(e) =>
                onChange({
                  ...d,
                  translations: {
                    ...d.translations,
                    [lang]: { ...d.translations[lang], name: e.target.value },
                  },
                })
              }
            />
          </label>
          <label>
            {c("number")}
            <input
              required
              maxLength={100}
              value={d.catalog.productNumber}
              onChange={(e) =>
                onChange({
                  ...d,
                  catalog: { ...d.catalog, productNumber: e.target.value },
                })
              }
            />
          </label>
          <label className="catalog-span">
            {c("description")}
            <textarea
              rows={3}
              maxLength={4000}
              value={d.translations[lang].description}
              onChange={(e) =>
                onChange({
                  ...d,
                  translations: {
                    ...d.translations,
                    [lang]: {
                      ...d.translations[lang],
                      description: e.target.value,
                    },
                  },
                })
              }
            />
          </label>
        </div>
        <h2>
          {c("rich")} · {lang.toUpperCase()}
        </h2>
        <RichEditor
          key={lang}
          language={lang}
          fallback={d.translations[lang].description}
          value={d.extra.richDescription ?? {}}
          onChange={(richDescription) => extra({ richDescription })}
        />
        <div className="catalog-form-grid">
          {(["manufacturer", "manufacturerNumber", "ean"] as const).map((k) => (
            <label key={k}>
              {c(k)}
              <input
                value={d.extra.identity?.[k] ?? ""}
                onChange={(e) =>
                  extra({
                    identity: { ...d.extra.identity, [k]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>
        <div className="catalog-flags">
          {(["digital", "shippingFree"] as const).map((k) => (
            <label className="checkbox-label" key={k}>
              <input
                type="checkbox"
                checked={!!d.extra[k]}
                onChange={(e) => extra({ [k]: e.target.checked })}
              />
              {c(k)}
            </label>
          ))}
        </div>
      </>
    );
  if (tab === "prices")
    return (
      <>
        <div className="catalog-form-grid">
          {field("price", "price")}
          {field("taxRate", "tax")}
          {field("stock", "stock")}
          {field("listPrice", "listPrice", true)}
          {field("minPurchase", "min")}
          {field("purchaseSteps", "steps")}
          {field("maxPurchase", "max", true)}
          {field("deliveryDays", "delivery")}
          {field("regulationPrice", "regulationPrice", true)}
        </div>
        <ReferencePriceFields draft={draft} onChange={onChange} />
        <h2>{c("tiers")}</h2>
        {d.commerce.advancedPrices.map((tier: any, i: number) => (
          <div className="catalog-form-grid catalog-tier" key={i}>
            {(
              ["rule_id", "quantity_start", "quantity_end", "discount"] as const
            ).map((k, j) => (
              <label key={k}>
                {c((["rule", "from", "to", "discount"] as const)[j])}
                <input
                  type={j ? "number" : "text"}
                  min={0}
                  max={k === "discount" ? 100 : undefined}
                  step={k === "discount" ? "0.01" : "1"}
                  value={k === "discount" ? tier[k] * 100 : (tier[k] ?? "")}
                  onChange={(e) =>
                    onChange({
                      ...d,
                      commerce: {
                        ...d.commerce,
                        advancedPrices: d.commerce.advancedPrices.map(
                          (v: any, n: number) =>
                            n === i
                              ? {
                                  ...v,
                                  [k]: j
                                    ? k === "quantity_end" &&
                                      e.target.value === ""
                                      ? null
                                      : Number(e.target.value) /
                                        (k === "discount" ? 100 : 1)
                                    : e.target.value,
                                }
                              : v,
                        ),
                      },
                    })
                  }
                />
              </label>
            ))}
            <button
              type="button"
              className="studio-secondary"
              onClick={() =>
                onChange({
                  ...d,
                  commerce: {
                    ...d.commerce,
                    advancedPrices: d.commerce.advancedPrices.filter(
                      (_: any, n: number) => n !== i,
                    ),
                  },
                })
              }
            >
              {c("remove")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="studio-secondary"
          onClick={() =>
            onChange({
              ...d,
              commerce: {
                ...d.commerce,
                advancedPrices: [
                  ...d.commerce.advancedPrices,
                  {
                    rule_id: "",
                    quantity_start: 1,
                    quantity_end: null,
                    discount: 0,
                  },
                ],
              },
            })
          }
        >
          + {c("add")}
        </button>
      </>
    );
  if (tab === "media")
    return <ProductMedia draft={draft} onChange={onChange} />;
  if (tab === "assignments")
    return (
      <>
        <h2>{c("categories")}</h2>
        <p>{c("categoryHint")}</p>
        <div className="catalog-category-checks">
          {categories.map((cat) => (
            <label className="checkbox-label" key={cat.id}>
              <input
                type="checkbox"
                checked={d.catalog.categoryIds.includes(cat.id)}
                onChange={(e) =>
                  onChange({
                    ...d,
                    catalog: {
                      ...d.catalog,
                      categoryIds: e.target.checked
                        ? [...d.catalog.categoryIds, cat.id]
                        : d.catalog.categoryIds.filter((id) => id !== cat.id),
                    },
                  })
                }
              />
              {cat.data.translations[lang]?.name ??
                cat.data.translations.en.name}
            </label>
          ))}
        </div>
        <h2>{c("assignments")}</h2>
        <div className="catalog-category-checks">
          {d.channels?.map((channel) => (
            <label className="checkbox-label" key={channel.id}>
              <input
                type="checkbox"
                checked={
                  d.catalog.salesChannelIds?.includes(channel.id) ??
                  channel.visible
                }
                onChange={(e) => {
                  const ids =
                    d.catalog.salesChannelIds ??
                    d.channels!.filter((c) => c.visible).map((c) => c.id);
                  onChange({
                    ...d,
                    catalog: {
                      ...d.catalog,
                      salesChannelIds: e.target.checked
                        ? [...ids, channel.id]
                        : ids.filter((id) => id !== channel.id),
                    },
                  });
                }}
              />
              {channel.data.name[lang] ?? channel.data.name.en}
            </label>
          ))}
        </div>
        <p>{c("channelsHint")}</p>
      </>
    );
  if (tab === "specs")
    return (
      <>
        <h2>
          {c("specs")} · {lang.toUpperCase()}
        </h2>
        <PairFields
          value={d.extra.specifications?.[lang] ?? {}}
          onChange={(v) =>
            extra({ specifications: { ...d.extra.specifications, [lang]: v } })
          }
        />
        <h2>{c("key")}</h2>
        <PairFields
          value={d.commerce.properties}
          onChange={(properties) =>
            onChange({ ...d, commerce: { ...d.commerce, properties } })
          }
        />
        <div className="catalog-form-grid">
          {(["weight", "width", "height", "length"] as const).map((k) => (
            <label key={k}>
              {c(k)}
              <input
                type="number"
                min={0}
                step="0.01"
                value={d.extra.automation?.[k] ?? ""}
                onChange={(e) => {
                  const automation = { ...d.extra.automation };
                  if (e.target.value === "") delete automation[k];
                  else automation[k] = Number(e.target.value);
                  extra({ automation });
                }}
              />
            </label>
          ))}
        </div>
      </>
    );
  if (tab === "seo") {
    const seo = {
      title: "",
      description: "",
      slug: "",
      ...d.extra.seo?.[lang],
    };
    return (
      <div className="catalog-form-grid">
        {(["title", "description", "slug"] as const).map((k) => (
          <label key={k}>
            {c(k === "description" ? "metaDescription" : k)}
            <input
              maxLength={k === "description" ? 500 : 200}
              value={seo[k]}
              onChange={(e) =>
                extra({
                  seo: {
                    ...d.extra.seo,
                    [lang]: { ...seo, [k]: e.target.value },
                  },
                })
              }
            />
          </label>
        ))}
        <div className="catalog-seo-preview">
          <strong>{seo.title || d.translations[lang].name}</strong>
          <small>/{seo.slug || d.id}</small>
          <p>{seo.description || d.translations[lang].description}</p>
        </div>
      </div>
    );
  }
  return null;
}
