/** studio types: Studio layout, session/workspace controller, authenticated transport and lazy workspace navigation. */
export type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  media?: { id: string; url: string; view: string }[];
  price: number;
  stock: number;
  revision: number;
  tax_rate: number;
  min_purchase: number;
  purchase_steps: number;
  max_purchase?: number;
  advanced_prices: {
    rule_id: string;
    quantity_start: number;
    quantity_end: number | null;
    discount: number;
  }[];
};
export type Graph = {
  engine?: string;
  documents?: {
    product_id: string;
    document_id: string;
    title: string;
    source: string;
  }[];
  needs: {
    product_id: string;
    need: string;
    source: string;
    confidence: number;
  }[];
  pairs: { left: string; right: string; source: string }[];
};
export type Overview = {
  tenant: string;
  locale: string;
  dataMode: string;
  products: Product[];
  productsPagination: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
  summary: {
    orders: number;
    ordersToday: number;
    revenue: number;
    pendingPlans: number;
    appliedPlans: number;
  };
  orders: {
    id: string;
    number: string;
    total: number;
    time: string;
    channel: string;
    payment: string;
  }[];
  timeline: { day: string; orders: number; revenue: number }[];
  knowledge: {
    graph: Graph;
    indexedProducts: number;
    lastIndexed: string | null;
  };
  learning: {
    timeline: { day: string; views: number; rewarded: number }[];
    variants: {
      variant: string;
      views: number;
      purchases: number;
      estimate: number;
    }[];
  };
  activity: { kind: string; time: string; id: string }[];
  channels: {
    channel: string;
    calls: number;
    httpFailures: number;
    lastSeen: string;
  }[];
  connections: {
    localMCPConfig?: object;
    chatgptAccountLinked: boolean;
    claudeAccountLinked: boolean;
    localMCP: boolean;
    ucpCheckout: boolean;
    remoteOAuth: boolean;
  };
  capabilities: string[];
};
export type Preview = {
  model: string;
  inference: string;
  locale?: string;
  catalogBefore: Product[];
  proposal: {
    summary: string;
    app_action?: { app: string; action: string; arguments_json: string } | null;
    changes: {
      product_id: string;
      price?: number | null;
      stock?: number | null;
    }[];
    experience?: { mode: string; headline: string } | null;
  };
  verifiedFacts?: {
    demoOrderCount: number;
    learningSignals?: { variant: string; views: number; purchases: number }[];
  };
  knowledge?: Graph;
};
export type Message = {
  id: number;
  role: string;
  content: string;
  applied: boolean;
  data: { error?: boolean; taskId?: string; preview?: Preview };
};
export type Provider = {
  id: string;
  name: string;
  model: string;
  configured: boolean;
};
export type { RequestFn } from "../../shared/api/types";
