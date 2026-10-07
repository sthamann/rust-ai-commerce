/** Revision-bound quantity update, preserving SKU minimum and server pricing authority. */
import { shopApi, type Cart } from "../../shared/api/shop-api";
export async function updateCartQuantity(cart: Cart, pid: string, q: number) {
  return shopApi<Cart>(
    "/store-api/checkout/cart",
    {
      revision: cart.revision,
      items: cart.lineItems
        .map((i) => ({ id: i.id, quantity: i.id === pid ? q : i.quantity }))
        .filter((i) => i.quantity > 0),
    },
    cart.token,
    "PUT",
  );
}
