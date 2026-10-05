/** Scope-safe in-flight sharing, failed reads and write barriers at the actual Studio/storefront transport. */
import { describe, expect, it, vi } from "vitest";
import { requestJson } from "../../src/shared/api/request-json";
import { createStudioRequest } from "../../src/admin/shell/requests";
import { shopApi } from "../../src/shared/api/shop-api";
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const response = () =>
  new Response(JSON.stringify({ data: { title: "Original" } }), {
    status: 200,
  });
describe("read request sharing", () => {
  it("shares identical Studio reads, isolates callers and discards completed responses", async () => {
    const pending = deferred();
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => pending.promise)
      .mockImplementation(async () => response());
    vi.stubGlobal("fetch", fetch);
    const api = createStudioRequest("user-one", "tenant-one", "de-DE");
    const a = api("/api/merchant/commerce");
    const b = api("/api/merchant/commerce");
    expect(fetch).toHaveBeenCalledTimes(1);
    pending.resolve(response());
    const [one, two] = await Promise.all([a, b]);
    (one as any).data.title = "Changed";
    expect((two as any).data.title).toBe("Original");
    await api("/api/merchant/commerce");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("keeps merchant, shop, language, channel and customer context distinct", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    await Promise.all([
      createStudioRequest("a", "one", "de-DE")("/api/merchant/commerce"),
      createStudioRequest("b", "one", "de-DE")("/api/merchant/commerce"),
      createStudioRequest("a", "two", "de-DE")("/api/merchant/commerce"),
      createStudioRequest("a", "one", "es-ES")("/api/merchant/commerce"),
    ]);
    expect(fetch).toHaveBeenCalledTimes(4);
    history.replaceState(null, "", "/?shop=one&channel=a");
    const a = shopApi("/store-api/product", {}, "cart-a");
    const duplicate = shopApi("/store-api/product", {}, "cart-a");
    history.replaceState(null, "", "/?shop=one&channel=b");
    const b = shopApi("/store-api/product", {}, "cart-a");
    localStorage.setItem("rac-customer:one", "customer-two");
    const customer = shopApi("/store-api/product", {}, "cart-a");
    await Promise.all([a, duplicate, b, customer]);
    expect(fetch).toHaveBeenCalledTimes(7);
  });
  it("does not retain errors or share mutations and custom app calls", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("Offline"))
        .mockImplementation(async () => response()),
    );
    await expect(requestJson("/store-api/context", {})).rejects.toThrow(
      "Offline",
    );
    await requestJson("/store-api/context", {});
    await Promise.all([
      requestJson("/api/apps/demo/http", {}),
      requestJson("/api/apps/demo/http", {}),
      requestJson("/store-api/checkout/order", { method: "POST" }),
      requestJson("/store-api/checkout/order", { method: "POST" }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(6);
  });
  it("a write prevents new consumers joining a pre-write read", async () => {
    const old = deferred();
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => old.promise)
      .mockImplementation(async () => response());
    vi.stubGlobal("fetch", fetch);
    const a = requestJson("/api/merchant/commerce", {});
    await requestJson("/api/merchant/commerce", { method: "PUT", body: "{}" });
    await requestJson("/api/merchant/commerce", {});
    expect(fetch).toHaveBeenCalledTimes(3);
    old.resolve(response());
    await a;
  });
});
