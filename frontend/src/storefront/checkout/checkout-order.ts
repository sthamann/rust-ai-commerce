/** Bind the purchase to the reviewed cart and total; the server remains the pricing authority. */
import { shopApi, type Cart, type Order } from "../../shared/api/shop-api";
import { responseError } from "../../shared/i18n/errors-i18n";
export async function placeCheckoutOrder(
  cart: Cart,
  locale: string,
  tenant: string,
  channel: string,
): Promise<Order> {
  try {
    const response = await fetch("/store-api/checkout/order", {
      method: "POST",
      headers: {
        "sw-context-token": cart.token,
        "Idempotency-Key": `browser-${cart.id}`,
        "x-commerce-locale": locale,
        "x-tenant": tenant,
        "sw-sales-channel-id": channel,
        "x-commerce-cart-revision": String(cart.revision),
        "x-commerce-total-minor": String(
          Math.round(cart.price.totalPrice * 100),
        ),
        ...(new URLSearchParams(location.search).get("sandbox") === "1"
          ? {
              Authorization: `Bearer ${sessionStorage.getItem("rac-user-token")}`,
            }
          : {}),
      },
    });
    const data = await response.json();
    if (!response.ok)
      throw responseError(
        data.errors?.[0]?.detail ?? "Order failed",
        response.status,
      );
    return data;
  } catch (failure) {
    // Read the committed snapshot once; never repeat the financial command.
    try {
      const recovered = await shopApi<Cart>(
        "/store-api/checkout/cart",
        undefined,
        cart.token,
      );
      if (
        recovered.id === cart.id &&
        recovered.status === "completed" &&
        recovered.order
      )
        return recovered.order;
    } catch {
      // A failed status read must not replace the original checkout error.
    }
    throw failure;
  }
}
