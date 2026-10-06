/** Coalesce simultaneous identical core reads with complete identity; no persisted response cache. */
import { reportMerchantSessionFailure } from "./merchant-session";
type JsonResponse = {
  value: any;
  ok: boolean;
  status: number;
  statusText: string;
};
const pending = new Map<string, Promise<JsonResponse>>();
let generation = 0;
export async function requestJson(
  path: string,
  init: RequestInit,
): Promise<JsonResponse> {
  const method = (init.method ?? "GET").toUpperCase();
  const read =
    !init.signal &&
    !path.startsWith("/api/apps/") &&
    (method === "GET" ||
      (method === "POST" &&
        [
          "/store-api/product",
          "/api/search/product",
          "/api/search/order",
        ].includes(path)));
  if (!read) {
    generation++;
    pending.clear();
  }
  const headers = [...new Headers(init.headers).entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const key = JSON.stringify([
    generation,
    path,
    method,
    headers,
    init.body,
    init.credentials,
    init.mode,
  ]);
  const existing = read ? pending.get(key) : undefined;
  if (existing) return structuredClone(await existing);
  const operation = (async () => {
    const response = await fetch(path, init);
    const value = await response.json();
    reportMerchantSessionFailure(
      path,
      init.headers,
      response.status,
      value.errors?.[0]?.detail,
    );
    return {
      value,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    };
  })();
  const admitted = read && pending.size < 128;
  if (admitted) pending.set(key, operation);
  try {
    return structuredClone(await operation);
  } finally {
    if (pending.get(key) === operation) pending.delete(key);
    if (!read) {
      generation++;
      pending.clear();
    }
  }
}
