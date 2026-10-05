/** Editable native product aggregate and defaults shared by creation, detail and variant workflows. */
export const languages = ["en", "de", "fr", "es"] as const;
export type ProductDraft = {
  id?: string;
  channels?: { id: string; data: any; visible: boolean }[];
  revision: number;
  translations: Record<string, { name: string; description: string }>;
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
    translations: Record<
      string,
      { name: string; description?: string; slug?: string }
    >;
  };
};
export function newDraft(): ProductDraft {
  return {
    revision: 0,
    translations: Object.fromEntries(
      languages.map((l) => [l, { name: "", description: "" }]),
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
