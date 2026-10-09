/** Only the registered embedding storefront receives the shopper cart receipt capability; it verifies with Core. */
import type { Order } from "../../shared/api/shop-api";
export function checkoutParent(): string | undefined {
  if (location.pathname !== "/checkout" || window.parent === window) return;
  const q = new URLSearchParams(location.search);
  if (q.get("embed") !== "1") return;
  try {
    const u = new URL(q.get("parentOrigin") ?? "");
    if (u.protocol === "https:" && u.origin === q.get("parentOrigin"))
      return u.origin;
  } catch {
    /* Invalid destinations receive no receipt. */
  }
}
export function notifyCheckout(order: Order): void {
  const parent = checkoutParent();
  if (parent)
    window.parent.postMessage(
      {
        type: "vendune.checkout.completed",
        cartId: order.cart.id,
        token: order.cart.token,
        orderId: order.id,
      },
      parent,
    );
}
export function returnFromCheckout(): boolean {
  const parent = checkoutParent();
  if (!parent) return false;
  window.parent.postMessage({ type: "vendune.checkout.close" }, parent);
  return true;
}
