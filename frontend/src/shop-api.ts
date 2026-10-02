import { getLocale } from "./i18n";
export type Product = {
  id: string;
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
};
export type Selection = {
  country: string;
  shippingMethodId: string;
  paymentMethodId: string;
  address?: {
    name: string;
    street: string;
    postalCode: string;
    city: string;
  } | null;
};
export type Shipping = {
  id: string;
  name: string;
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
  active: boolean;
  businessOnly: boolean;
  mode: string;
};
export type Config = {
  countries: string[];
  taxes: { id: string; rates: Record<string, number> }[];
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
  id: string;
  token: string;
  revision: number;
  status: string;
  customerGroup: string;
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
      "x-commerce-locale": getLocale(),
      "x-tenant": new URLSearchParams(location.search).get("shop") ?? "atelier",
      ...(token ? { "sw-context-token": token } : {}),
      ...(merchant ? { Authorization: `Bearer ${merchant}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const v = await r.json();
  if (!r.ok) throw new Error(v.errors?.[0]?.detail ?? r.statusText);
  return v;
}
