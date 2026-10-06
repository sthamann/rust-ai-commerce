/** Shared explicit purchase button: mobile dock and desktop review use the same form and server-review state. */
import { useLegalText } from "../../shared/i18n/legal-i18n";
import { useShopText } from "../../shared/i18n/shop-i18n";
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
  const { l } = useLegalText();
  const { s, money } = useShopText(),
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
          ? `${l("pay")} · ${money(total)}`
          : x("review")}
    </button>
  );
}
