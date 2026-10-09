/** Editable native product aggregate and defaults shared by creation, detail and variant workflows. */
export const languages = ["en", "de", "fr", "es"] as const;
export type ProductDraft = {
  id?: string;
  mainLocale?: string;
  availableLocales?: string[];
  channels?: { id: string; data: any; visible: boolean }[];
  revision: number;
  translations: Record<
    string,
    { name: string | null; description: string | null }
  >;
  extra: any;
  commerce: any;
  catalog: {
    active: boolean;
    productNumber: string;
    categoryIds: string[];
    salesChannelIds?: string[];
    parentId: string | null;
    options: Record<string, string>;
  };
};
export type Category = {
  id: string;
  parentId: string | null;
  position: number;
  revision: number;
  data: {
    active: boolean;
    displayNestedProducts?: boolean;
    visible: boolean;
    type: string;
    url?: string;
    graphQuery?: {
      nodeType:
        | "intent"
        | "problem"
        | "occasion"
        | "audience"
        | "material"
        | "property";
      minimumConfidence: number;
      text: Record<string, string | null | undefined>;
    } | null;
    translations: Record<
      string,
      { name: string | null; description?: string | null; slug?: string | null }
    >;
  };
};
export function newDraft(): ProductDraft {
  return {
    revision: 0,
    mainLocale: "en-GB",
    availableLocales: ["en-GB", "de-DE", "fr-FR", "es-ES"],
    translations: Object.fromEntries(
      languages.map((l) => [
        l,
        { name: l === "en" ? "" : null, description: l === "en" ? "" : null },
      ]),
    ),
    extra: {
      seo: {},
      specifications: {},
      crossSelling: [],
      shippingFree: false,
      digital: false,
      richDescription: {},
      identity: {},
      automation: {},
    },
    commerce: {
      price: 0,
      taxRate: 19,
      stock: 0,
      minPurchase: 1,
      purchaseSteps: 1,
      maxPurchase: null,
      deliveryDays: 2,
      listPrice: null,
      regulationPrice: null,
      referencePrice: null,
      advancedPrices: [],
      media: [],
      properties: {},
    },
    catalog: {
      active: false,
      productNumber: "",
      categoryIds: [],
      parentId: null,
      options: {},
    },
  };
}
export function hydrateDraft(v: any): ProductDraft {
  const defaults = newDraft();
  return {
    ...defaults,
    ...v,
    translations: Object.fromEntries(
      (v.availableLocales ?? defaults.availableLocales!).map((l: string) => {
        const base = l.split("-")[0];
        const key =
          (v.availableLocales ?? defaults.availableLocales!).filter(
            (x: string) => x.split("-")[0] === base,
          ).length === 1
            ? base
            : l;
        return [
          key,
          v.translations?.[key] ?? { name: null, description: null },
        ];
      }),
    ),
    extra: { ...defaults.extra, ...v.extra },
    catalog: { ...defaults.catalog, ...v.catalog },
    commerce: { ...defaults.commerce, ...v.commerce },
  };
}
export function categoryDepth(
  category: Category,
  categories: Category[],
): number {
  const visited = new Set<string>();
  let parent = category.parentId;
  while (parent && !visited.has(parent)) {
    visited.add(parent);
    parent = categories.find((c) => c.id === parent)?.parentId ?? null;
  }
  return visited.size;
}
