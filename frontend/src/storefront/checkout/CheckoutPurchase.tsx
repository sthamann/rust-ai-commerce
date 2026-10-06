/** Shared explicit purchase button: mobile dock and desktop review use the same form and server-review state. */
import { useShopText } from "../../shared/i18n/shop-i18n";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useCheckoutText } from "../../shared/i18n/checkout-i18n";
export default function CheckoutPurchase({
  busy,
  reviewed,
  total,
  empty = false,
}: {
  busy: boolean;
  reviewed: boolean;
  total: number;
  empty?: boolean;
}) {
  const { s, money } = useShopText(),
    { c } = useCustomerText(),
    { x } = useCheckoutText();
  return (
    <button
      form="checkout-details"
      type="submit"
      className="shop-primary checkout-purchase"
      disabled={busy || empty}
    >
      {busy
        ? s("processing")
        : reviewed
          ? `${c("placeOrder")} · ${money(total)}`
          : x("review")}
    </button>
  );
}
