/** Product addresses retain SKU identity, localized slugs and storefront context. */
import { afterEach, expect, it, vi } from "vitest";
import {
  productURL,
  returnToCollection,
  routeProductId,
} from "../../src/storefront/catalog/product-url";
it("retains the implicit demo tenant when opening a reloadable product URL", () => {
  history.replaceState(null, "", "/?language=de-DE");
  const url = new URL(productURL({ id: "tee" }), location.origin);
  expect(url.searchParams.get("shop")).toBe("nord-atelier");
  expect(url.pathname).toBe("/products/tee");
});
it("builds a localized product address and discards merchant context", () => {
  history.replaceState(
    null,
    "",
    "/?shop=unit-shop&studio=productData&channel=default&language=de-DE",
  );
  const url = productURL({
    id: "chair",
    extra: {
      seo: { de: { title: "", description: "", slug: "stuhl-aus-eiche" } },
    },
  });
  expect(url).toBe(
    "/products/chair/stuhl-aus-eiche?shop=unit-shop&channel=default&language=de-DE",
  );
  expect(productURL({ id: "chair" })).toContain("/products/chair?");
});
it.each([
  ["/products/chair/stuhl-aus-eiche", "chair"],
  ["/products/chair", "chair"],
  ["/#product/chair", "chair"],
  ["/products/chair#order-confirmed", ""],
  ["/products/%ZZ", ""],
  ["/api/products/chair", ""],
])("resolves %s", (path, id) =>
  expect(routeProductId(new URL(path, "https://shop.example"))).toBe(id),
);

afterEach(() => vi.unstubAllGlobals());
it("returns a shared checkout shopper to the owned original shop with channel/language intact", () => {
  const assign = vi.fn();
  vi.stubGlobal("location", {
    href: "https://app.vendune.ai/checkout?shop=merchant-shop&channel=world&language=de-DE#order-confirmed",
    search: "?shop=merchant-shop&channel=world&language=de-DE",
    assign,
  });
  const push = vi.spyOn(history, "pushState");
  returnToCollection();
  expect(assign).toHaveBeenCalledWith(
    "https://merchant-shop.vendune.ai/?channel=world&language=de-DE#",
  );
  expect(push).not.toHaveBeenCalled();
  push.mockRestore();
});
it("keeps a local checkout in its existing SPA and emits route navigation", () => {
  history.replaceState(
    null,
    "",
    "/checkout?shop=local-shop&channel=default#order-confirmed",
  );
  const route = vi.fn();
  window.addEventListener("popstate", route);
  returnToCollection();
  expect(location.pathname).toBe("/");
  expect(location.search).toBe("?shop=local-shop&channel=default");
  expect(route).toHaveBeenCalledOnce();
  window.removeEventListener("popstate", route);
});
