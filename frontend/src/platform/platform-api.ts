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
  channels: { channel: string; calls: number; failures: number }[];
};
export type Shop = {
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
): Promise<T> {
  const r = await fetch(path, {
    cache: "no-store",
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!r.ok) throw new PlatformError(r.status);
  return r.json();
}
