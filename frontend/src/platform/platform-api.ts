/** Tenant-independent operator API; credentials stay in the current browser session. */
export type Amount = {
  currency: string;
  orders: number;
  booked: string;
  simulated: string;
  captured: string;
};
export type Overview = {
  days: number;
  generatedAt: string;
  shops: number;
  sandboxes: number;
  merchantUsers: number;
  products: number;
  customers: number;
  orders: number;
  pendingEvents: number;
  amounts: Amount[];
  channels: Pick<Traffic, "channel" | "calls" | "failures" | "responses">[];
};
export type Shop = {
  status: "active" | "paused" | "archived";
  statusRevision: number;
  urls: { storefrontUrl: string; studioUrl: string };
  id: string;
  name: string;
  products: number;
  customers: number;
  orders: number;
  members: number;
  apps: number;
  salesChannels: number;
  knowledgeSources: number;
  createdAt: string;
};
export type ShopPage = {
  elements: Shop[];
  hasMore: boolean;
  nextCursor: string | null;
};
export type ShopDetail = {
  id: string;
  name: string;
  days: number;
  amounts: Amount[];
  timeline: { day: string; orders: number }[];
  status: Shop["status"];
  statusRevision: number;
  createdAt: string;
  urls: Shop["urls"];
  counts: { products: number; customers: number; apps: number };
  members: { name: string; email: string; role: string; active: boolean }[];
  salesChannels: { id: string; configuration: Record<string, unknown> }[];
  business: Record<string, string>;
  traffic: Traffic[];
};
export type Operator = { user: { id: string; name: string; email: string } };
export type Audit = {
  id: number;
  actor: string | null;
  action: string;
  shop: string | null;
  time: string;
};
export class PlatformError extends Error {
  constructor(public status: number) {
    super(String(status));
  }
}
export async function platformRequest<T>(
  token: string,
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const r = await fetch(path, {
    cache: "no-store",
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!r.ok) throw new PlatformError(r.status);
  return r.json();
}

export type Traffic = {
  channel: string;
  calls: number;
  failures: number;
  responses?: Record<string, number>;
  totalMs: number;
  maxMs: number;
  timedCalls: number;
  lastSeen?: string;
};
export type AIProvider = { model: string; endpoint: string; enabled: boolean };
export type AISettings = {
  revision: number;
  settings: { defaultProvider: string; providers: Record<string, AIProvider> };
  keyStored: Record<string, boolean>;
  encryptedStorageReady: boolean;
  effective: {
    defaultProvider: string;
    providers: { id: string; model: string; configured: boolean }[];
  } | null;
};
export type Infrastructure = {
  resources: {
    processResidentBytes: number | null;
    containerMemoryBytes: number | null;
    containerMemoryLimitBytes: number | null;
    containerCpuPercent: number | null;
    cpuQuotaCores: number | null;
  };
  generatedAt: string;
  database: {
    healthy: boolean;
    probeMs: number;
    bytes: number;
    version: string;
    activeConnections: number;
  };
  qdrant: { healthy: boolean; probeMs: number };
  pendingEvents: number;
  process: {
    poolConnections: number;
    poolIdle: number;
    readCache: { decodedHits: number; payloadLoads: number };
  };
  channels: Traffic[];
};
