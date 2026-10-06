/** Product addresses retain SKU identity, localized slugs and storefront context. */
import { expect, it } from "vitest";
import {
  productURL,
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
