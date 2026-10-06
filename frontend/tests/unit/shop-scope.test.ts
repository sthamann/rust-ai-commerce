/** Legacy bookmarks upgrade to DNS-bound tenants; protected/staging/login locations remain on their origin. */
import { expect, it } from "vitest";
import {
  canonicalShopURL,
  validShopId,
  shopScope,
} from "../../src/shared/api/shop-scope";
it("upgrades the storefront and preserves product, language and tracking context", () => {
  expect(
    canonicalShopURL(
      new URL(
        "https://app.vendune.ai/?shop=release-check-20261006&lang=de-DE#product/lamp",
      ),
    ),
  ).toBe("https://release-check-20261006.vendune.ai/?lang=de-DE#product/lamp");
});
it.each(["#merchant", "#login", "#platform", "#studio-content"])(
  "keeps protected %s on shared login origin",
  (hash) => {
    expect(
      canonicalShopURL(new URL(`https://app.vendune.ai/?shop=my-shop${hash}`)),
    ).toBeUndefined();
  },
);
it.each([
  "https://app.vendune.ai/?shop=my-shop&sandbox=1",
  "https://app.vendune.ai/?shop=my-shop&studio=developers",
  "http://127.0.0.1:8787/?shop=my-shop",
  "https://my-shop.vendune.ai/",
  "https://admin.vendune.ai/",
])("does not move %s", (url) =>
  expect(canonicalShopURL(new URL(url))).toBeUndefined(),
);
it.each([
  "admin",
  "app",
  "api",
  "mail",
  "www",
  "-abc",
  "abc-",
  "abc.def",
  "a",
  "a".repeat(49),
])("rejects non-shop hostname %s", (id) => expect(validShopId(id)).toBe(false));
it("retains local scope and permits DNS-safe IDs", () => {
  expect(shopScope()).toBe("unit-shop");
  expect(validShopId("my-shop-2026")).toBe(true);
});
