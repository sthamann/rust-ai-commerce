/** Receipt messages stay scoped to the registered parent and expose no customer information. */
import { afterEach, expect, it, vi } from "vitest";
import {
  checkoutParent,
  notifyCheckout,
  returnFromCheckout,
} from "../../src/storefront/checkout/embedded-checkout";
import type { Order } from "../../src/shared/api/shop-api";
const original = window.parent;
afterEach(() =>
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: original,
  }),
);
it("sends the receipt capability only from an explicitly embedded checkout to an exact HTTPS origin", () => {
  const postMessage = vi.fn();
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: { postMessage },
  });
  history.replaceState(
    null,
    "",
    "/checkout?embed=1&parentOrigin=https%3A%2F%2Fown.vendune.ai",
  );
  const order = {
    id: "order",
    cart: { id: "cart", token: "capability" },
    customer: { email: "must-not-leave" },
  } as unknown as Order;
  expect(checkoutParent()).toBe("https://own.vendune.ai");
  notifyCheckout(order);
  expect(postMessage).toHaveBeenCalledWith(
    {
      type: "vendune.checkout.completed",
      cartId: "cart",
      token: "capability",
      orderId: "order",
    },
    "https://own.vendune.ai",
  );
  expect(JSON.stringify(postMessage.mock.calls)).not.toContain(
    "must-not-leave",
  );
  expect(returnFromCheckout()).toBe(true);
  for (const path of [
    "/checkout?embed=1&parentOrigin=http://evil.test",
    "/checkout?embed=1&parentOrigin=https://own.vendune.ai/path",
    "/checkout?parentOrigin=https://own.vendune.ai",
    "/?embed=1&parentOrigin=https://own.vendune.ai",
  ]) {
    history.replaceState(null, "", path);
    expect(checkoutParent()).toBeUndefined();
  }
});
it("ordinary top-level checkout sends no receipt to another window", () => {
  history.replaceState(
    null,
    "",
    "/checkout?embed=1&parentOrigin=https://own.vendune.ai",
  );
  expect(checkoutParent()).toBeUndefined();
  expect(returnFromCheckout()).toBe(false);
});
