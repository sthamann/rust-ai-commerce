/** Catalogue races, tenant credentials and opt-in ranking exercised through actual hooks/transport. */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { shopApi } from "../../src/shared/api/shop-api";
import { useCatalog } from "../../src/storefront/shell/useCatalog";
import { usePersonalization } from "../../src/storefront/shell/usePersonalization";
import { publishConsent } from "../../src/shared/legal/consent-store";
import { cart, product } from "./fixtures";
const response = (value: unknown, status = 200) => ({
  ok: status < 400,
  status,
  statusText: "Error",
  json: async () => value,
});
describe("Storefront API isolation", () => {
  it("scopes locale, sales channel, customer and checkout context independently", async () => {
    history.replaceState({}, "", "/?shop=unit-shop&channel=retail");
    localStorage.setItem("rac-customer:unit-shop", "customer-a");
    localStorage.setItem("rac-customer:other", "customer-b");
    const fetcher = vi.fn().mockResolvedValue(response({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    await shopApi("/store-api/product", { search: "blue" }, "checkout-a");
    expect(fetcher.mock.calls[0][1].headers).toMatchObject({
      "x-tenant": "unit-shop",
      "sw-sales-channel-id": "retail",
      "x-customer-token": "customer-a",
      "sw-context-token": "checkout-a",
      "x-commerce-locale": "en-GB",
    });
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty(
      "Authorization",
    );
    sessionStorage.setItem("rac-user-token", "owner-a");
    history.replaceState({}, "", "/?shop=unit-shop&sandbox=1");
    await shopApi("/store-api/product");
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer owner-a",
    );
    await shopApi("/api/admin", undefined, undefined, "DELETE", "explicit-a");
    expect(fetcher.mock.calls[2][1]).toMatchObject({
      method: "DELETE",
      headers: { Authorization: "Bearer explicit-a" },
    });
  });
  it("removes only the expired customer session and retries cart creation without it", async () => {
    localStorage.setItem("rac-customer:unit-shop", "expired");
    localStorage.setItem("rac-customer:other", "valid");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ errors: [{ detail: "Customer session expired" }] }, 401),
      )
      .mockResolvedValueOnce(response(cart));
    vi.stubGlobal("fetch", fetcher);
    expect(await shopApi("/store-api/checkout/cart", {})).toEqual(cart);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].headers).not.toHaveProperty(
      "x-customer-token",
    );
    expect(localStorage.getItem("rac-customer:other")).toBe("valid");
  });
  it.each([
    ["/store-api/account", {}, undefined],
    ["/store-api/checkout/cart", {}, "PUT"],
    ["/store-api/checkout/cart", undefined, undefined],
  ])(
    "never replays protected operations: %s %s %s",
    async (path, body, method) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          response({ errors: [{ detail: "Customer session expired" }] }, 401),
        );
      vi.stubGlobal("fetch", fetcher);
      await expect(
        shopApi(path, body, undefined, method),
      ).rejects.toMatchObject({ status: 401 });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects non-session errors without dropping a valid login", async () => {
    localStorage.setItem("rac-customer:unit-shop", "valid");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, 403)));
    await expect(shopApi("/store-api/account")).rejects.toMatchObject({
      status: 403,
    });
    expect(localStorage.getItem("rac-customer:unit-shop")).toBe("valid");
  });
});
describe("Catalogue lifecycle", () => {
  it("waits for checkout context, debounces search and ignores a late obsolete response", async () => {
    const pending: Array<(value: unknown) => void> = [];
    const fetcher = vi.fn(
      (_path: string, _init?: RequestInit) =>
        new Promise((resolve) => pending.push(resolve)),
    );
    vi.stubGlobal("fetch", fetcher);
    const error = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ context }) => useCatalog(context, "en-GB", error),
      { initialProps: { context: undefined as typeof cart | undefined } },
    );
    await act(async () => {});
    expect(fetcher).not.toHaveBeenCalled();
    rerender({ context: cart });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    act(() => result.current.setQuery("  blue  "));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toMatchObject({
      search: "blue",
    });
    await act(async () =>
      pending[1](response({ elements: [product], nextCursor: "page-2" })),
    );
    await act(async () =>
      pending[0](response({ elements: [], nextCursor: null })),
    );
    expect(result.current.products).toEqual([product]);
    expect(result.current.nextCursor).toBe("page-2");
    expect(result.current.catalogLoading).toBe(false);
    act(() => result.current.setCategory("lighting"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(
      JSON.parse(fetcher.mock.calls[2][1]!.body as string).categoryId,
    ).toBe("lighting");
    unmount();
    await act(async () =>
      pending[2](response({ elements: [], nextCursor: null })),
    );
    expect(error).not.toHaveBeenCalled();
  });
  it("supports cursor navigation and surfaces a failed reload", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(response({ elements: [product], nextCursor: "next" }));
    vi.stubGlobal("fetch", fetcher);
    const error = vi.fn();
    const { result } = renderHook(() => useCatalog(cart, "en-GB", error));
    await waitFor(() => expect(result.current.products).toHaveLength(1));
    await act(async () => {
      await result.current.catalog(cart.token, "next");
    });
    expect(result.current.pageCursor).toBe("next");
    fetcher.mockRejectedValueOnce(new Error("catalog offline"));
    act(() => result.current.setCategory("desk"));
    await waitFor(() => expect(error).toHaveBeenCalledWith("catalog offline"));
    expect(result.current.catalogLoading).toBe(false);
  });
});
describe("Personalization consent and ranking", () => {
  it("keeps original order and sends no signal before consent", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() =>
      usePersonalization([product], cart, "lamp", "unit-shop"),
    );
    await act(async () => {});
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.list).toEqual([product]);
    expect(result.current.adapted).toBe(false);
  });
  it("uses server ranking without mutating products and disables it on withdrawal", async () => {
    publishConsent({
      choices: { personalization: true },
      decided: true,
      policyVersion: "test",
    });
    const second = { ...product, id: "chair", category: "seating" };
    const products = [product, second];
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response({ rankedProductIds: ["chair"], adapted: true }),
      );
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() =>
      usePersonalization(products, cart, "lamp", "unit-shop"),
    );
    await waitFor(() => expect(result.current.personalized).toBe(true));
    expect(result.current.list.map((p) => p.id)).toEqual(["chair", "lamp"]);
    expect(products.map((p) => p.id)).toEqual(["lamp", "chair"]);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      kind: "view",
      productId: "lamp",
    });
    act(() => publishConsent(undefined));
    expect(result.current.list).toEqual(products);
    expect(result.current.adapted).toBe(false);
  });
  it("falls back to category affinity only after three views", async () => {
    const products = [
      product,
      { ...product, id: "chair", category: "seating" },
    ];
    const { result } = renderHook(() =>
      usePersonalization(products, undefined, "", "unit-shop"),
    );
    act(() => {
      publishConsent({
        choices: { personalization: true },
        decided: true,
        policyVersion: "test",
      });
      result.current.setViewed({ seating: 2 });
    });
    expect(result.current.adapted).toBe(false);
    act(() => result.current.setViewed({ seating: 3 }));
    expect(result.current.adapted).toBe(true);
    expect(result.current.list[0].id).toBe("chair");
  });
  it("survives a failed signal and ignores an answer after unmount", async () => {
    publishConsent({
      choices: { personalization: true },
      decided: true,
      policyVersion: "test",
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const first = renderHook(() =>
      usePersonalization([product], cart, "lamp", "unit-shop"),
    );
    await act(async () => {});
    expect(first.result.current.list).toEqual([product]);
    first.unmount();
    let reply!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            reply = resolve;
          }),
      ),
    );
    const second = renderHook(() =>
      usePersonalization([product], cart, "lamp", "unit-shop"),
    );
    second.unmount();
    await act(async () =>
      reply(response({ rankedProductIds: [], adapted: true })),
    );
  });
});
