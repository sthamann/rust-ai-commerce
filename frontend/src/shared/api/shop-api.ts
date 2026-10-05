/** shop api: Typed commerce contracts, merchant/store transports and binary download helper. */
import { responseError } from "../i18n/errors-i18n";
import { getLocale } from "../i18n/i18n";
export type Product = {
  id: string;
  product_number?: string;
  parent_id?: string;
  name: string;
  description: string;
  category: string;
  price: number;
  calculated_price?: Price;
  tax_rate: number;
  stock: number;
  revision: number;
  options: Record<string, string>;
  media: { id: string; url: string; view: string }[];
  properties: Record<string, string>;
  min_purchase: number;
  purchase_steps: number;
  max_purchase?: number;
  delivery_days: number;
  list_price?: number;
  extra?: {
    seo?: Record<string, { title: string; description: string; slug: string }>;
    specifications?: Record<string, Record<string, string>>;
    crossSelling?: string[];
    shippingFree?: boolean;
    digital?: boolean;
    richDescription?: Record<
      string,
      import("../content/RichDescription").RichBlock[]
    >;
  };
};
export type Selection = {
  country: string;
  shippingMethodId: string;
  paymentMethodId: string;
  address?: import("../customer/customer-types").Address | null;
  billingAddress?: import("../customer/customer-types").Address | null;
  billingAddressId?: string | null;
  shippingAddressId?: string | null;
  customerEmail?: string | null;
};
export type Shipping = {
  id: string;
  name: string;
  translations?: import("../geography/geography-types").TextMap;
  description?: string;
  price: number;
  freeAbove: number | null;
  minDays: number;
  maxDays: number;
  countries: string[];
  active: boolean;
  taxType: string;
};
export type Payment = {
  id: string;
  name: string;
  translations?: import("../geography/geography-types").TextMap;
  description?: string;
  countries?: string[];
  restrictedCountries?: boolean;
  active: boolean;
  businessOnly: boolean;
  mode: string;
};
export type Config = {
  countries: string[];
  mainLocale?: string;
  locales?: string[];
  countryDefinitions?: import("../geography/geography-types").Country[];
  taxes: import("../geography/geography-types").TaxClass[];
  shipping: Shipping[];
  payments: Payment[];
};
export type Price = {
  unitPrice: number;
  totalPrice: number;
  listPrice?: { price: number; percentage: number };
  referencePrice?: { price: number; reference_unit: number; unit_name: string };
};
export type Order = {
  id: string;
  orderNumber: string;
  revision: number;
  state: string;
  cart: Cart;
  payment: {
    provider: string;
    attemptId?: string;
    state: string;
    realMoneyCharged?: boolean;
    method?: Payment;
  };
  deliveries?: {
    state: string;
    trackingCode?: string;
    shippingMethod: Shipping;
    deliveryDate: { earliest: string; latest: string };
  }[];
};
export type Cart = {
  couponCodes?: string[];
  discountTotal?: number;
  discounts?: {
    id: string;
    name: Record<string, string>;
    kind: string;
    amount: number;
  }[];
  id: string;
  token: string;
  revision: number;
  status: string;
  customerGroup: string;
  customerId?: string | null;
  customerEmail?: string | null;
  checkout: Selection;
  availableCountries: string[];
  selectionNeedsConfirmation?: boolean;
  lineItems: {
    id: string;
    label: string;
    quantity: number;
    minPurchase: number;
    purchaseSteps: number;
    maxPurchase?: number;
    price: Price;
  }[];
  shippingCosts: { totalPrice: number };
  availableShippingMethods: Shipping[];
  availablePaymentMethods: Payment[];
  deliveries: { deliveryDate: { earliest: string; latest: string } }[];
  price: {
    positionPrice: number;
    totalPrice: number;
    netPrice: number;
    tax: number;
    taxStatus: string;
  };
  order?: Order;
};
export type Review = {
  id: string;
  author: string;
  rating: number;
  title: string;
  content: string;
  verifiedPurchase: boolean;
  demo: boolean;
  approved?: boolean;
  productId?: string;
};
export type Detail = {
  product: Product;
  familyId: string;
  variants: Product[];
  variantsPagination: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
  calculatedPrices: {
    quantity: number;
    price: Price;
    discountPercent: number;
  }[];
  taxStatus: string;
  country: string;
  delivery?: { method: Shipping; minDays: number; maxDays: number };
  reviews: { count: number; average: number; elements: Review[] };
};
export function getContentLocale() {
  return new URLSearchParams(location.search).get("language") ?? getLocale();
}
export async function shopApi<T = unknown>(
  path: string,
  body?: unknown,
  token?: string,
  method?: string,
  merchant?: string,
): Promise<T> {
  const r = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      "x-commerce-locale": getContentLocale(),
      "sw-sales-channel-id":
        new URLSearchParams(location.search).get("channel") ?? "default",
      ...(localStorage.getItem(
        `rac-customer:${new URLSearchParams(location.search).get("shop") ?? "atelier"}`,
      )
        ? {
            "x-customer-token": localStorage.getItem(
              `rac-customer:${new URLSearchParams(location.search).get("shop") ?? "atelier"}`,
            )!,
          }
        : {}),
      "x-tenant": new URLSearchParams(location.search).get("shop") ?? "atelier",
      ...(token ? { "sw-context-token": token } : {}),
      ...(merchant ||
      (new URLSearchParams(location.search).get("sandbox") === "1"
        ? sessionStorage.getItem("rac-user-token")
        : "")
        ? {
            Authorization: `Bearer ${merchant || sessionStorage.getItem("rac-user-token")}`,
          }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const v = await r.json();
  if (
    r.status === 401 &&
    path.startsWith("/store-api/") &&
    v.errors?.[0]?.detail === "Customer session expired"
  ) {
    localStorage.removeItem(
      `rac-customer:${new URLSearchParams(location.search).get("shop") ?? "atelier"}`,
    );
    if (
      path === "/store-api/checkout/cart" &&
      body !== undefined &&
      method !== "PUT"
    )
      return shopApi<T>(path, body, token, method, merchant);
  }
  if (!r.ok)
    throw responseError(v.errors?.[0]?.detail ?? r.statusText, r.status);
  return v;
}
