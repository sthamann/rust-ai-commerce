/** Explicit synthetic domain fixtures; never copied from real merchant/customer data. */
import type { Cart, Product, Detail } from "../../src/shared/api/shop-api";
import type { Overview } from "../../src/admin/shell/studio-types";
export const product: Product = {
  id: "lamp",
  name: "Unit lamp",
  description: "Fixture lamp",
  category: "lighting",
  price: 49.9,
  tax_rate: 19,
  stock: 5,
  revision: 1,
  options: { color: "blue" },
  media: [{ id: "front", url: "/fixture.svg", view: "front" }],
  properties: { material: "steel" },
  min_purchase: 1,
  purchase_steps: 1,
  delivery_days: 3,
};
export const cart: Cart = {
  id: "unit-cart",
  token: "unit-context",
  revision: 1,
  status: "open",
  customerGroup: "private",
  checkout: {
    country: "DE",
    shippingMethodId: "standard",
    paymentMethodId: "card",
  },
  availableCountries: ["DE"],
  lineItems: [],
  shippingCosts: { totalPrice: 0 },
  availableShippingMethods: [],
  availablePaymentMethods: [],
  deliveries: [],
  price: {
    positionPrice: 0,
    totalPrice: 0,
    netPrice: 0,
    tax: 0,
    taxStatus: "gross",
  },
};
export const detail: Detail = {
  product,
  familyId: "lamp",
  variants: [product],
  variantsPagination: { nextCursor: null, hasMore: false, limit: 50 },
  calculatedPrices: [
    {
      quantity: 1,
      price: { unitPrice: 49.9, totalPrice: 49.9 },
      discountPercent: 0,
    },
  ],
  taxStatus: "gross",
  country: "DE",
  reviews: { count: 0, average: 0, elements: [] },
};
export const overview: Overview = {
  tenant: "unit-shop",
  locale: "en-GB",
  dataMode: "demo",
  products: [],
  productsPagination: { nextCursor: null, hasMore: false, limit: 50 },
  summary: {
    orders: 0,
    ordersToday: 0,
    revenue: 0,
    pendingPlans: 0,
    appliedPlans: 0,
  },
  orders: [],
  timeline: [],
  knowledge: {
    graph: { needs: [], pairs: [] },
    indexedProducts: 0,
    lastIndexed: null,
  },
  learning: { timeline: [], variants: [] },
  activity: [],
  channels: [],
  connections: {
    chatgptAccountLinked: false,
    claudeAccountLinked: false,
    localMCP: false,
    ucpCheckout: false,
    remoteOAuth: false,
  },
  capabilities: [],
};
export const providers = {
  providers: [
    {
      id: "ollama",
      name: "Fixture local",
      model: "fixture-model",
      configured: true,
    },
    {
      id: "openai",
      name: "OpenAI",
      model: "fixture-openai",
      configured: false,
    },
  ],
};
export const session = {
  token: "unit-token",
  workspace: "unit-shop",
  user: { id: "unit-user", name: "Unit Owner", email: "owner@example.test" },
  workspaces: [{ id: "unit-shop", name: "Unit shop", role: "owner" }],
};
export const mailSettings = {
  provider: "smtp",
  enabled: false,
  dryRun: true,
  notifyOrders: false,
  fromEmail: "",
  fromName: "",
  replyTo: "",
  smtpHost: "",
  smtpPort: 587,
  smtpMode: "starttls",
  smtpUsername: "",
  region: "global",
  defaultLocale: "en",
  templates: {},
};
export function mailStatus(settings = mailSettings) {
  return {
    revision: 1,
    settings: { ...settings },
    credentialsConfigured: { apiKey: false, smtpPassword: false },
    connected: false,
    jobs: [],
    defaultTemplates: Object.fromEntries(
      ["en", "de", "fr", "es"].map((lang) => [
        lang,
        { subject: "Order {orderNumber}", text: "Hello {firstName}", html: "" },
      ]),
    ),
  };
}
