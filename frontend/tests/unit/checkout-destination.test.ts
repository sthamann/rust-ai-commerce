/** External experiences must retain the Core checkout through transfer, payment and receipt. */
import { expect, it } from "vitest";
import { canonicalShopURL } from "../../src/shared/api/shop-scope";

it("keeps checkout and legacy transfer destinations on the shared commerce host", () => {
  for (const hash of [
    "#checkout/ticket",
    "#",
    "#payment/attempt",
    "#order-confirmed",
  ]) {
    expect(
      canonicalShopURL(
        new URL(
          `https://app.vendune.ai/checkout?shop=merchant-shop&channel=default${hash}`,
        ),
      ),
    ).toBeUndefined();
  }
  expect(
    canonicalShopURL(
      new URL("https://app.vendune.ai/?shop=merchant-shop#checkout/legacy"),
    ),
  ).toBeUndefined();
  expect(
    canonicalShopURL(
      new URL("https://app.vendune.ai/?shop=merchant-shop#product/tee"),
    ),
  ).toBe("https://merchant-shop.vendune.ai/#product/tee");
});
