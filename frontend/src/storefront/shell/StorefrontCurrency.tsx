/** Currency switching is a revision-bound server re-quote, scoped to tenant and sales channel. */
import { shopApi, type Cart } from "../../shared/api/shop-api";
import { useCurrencyText } from "../../shared/i18n/currency-i18n";
import { useStorefront } from "./StorefrontContext";
export default function StorefrontCurrency() {
  const { c } = useCurrencyText();
  const { cart, busy, run, save } = useStorefront();
  if (!cart || (cart.availableCurrencies?.length ?? 0) < 2) return null;
  return (
    <label className="shop-currency-picker">
      <span className="sr-only">{c("select")}</span>
      <select
        aria-label={c("select")}
        value={cart.price.currency ?? "EUR"}
        disabled={busy || cart.status !== "open"}
        onChange={(e) => {
          const currency = e.target.value;
          void run(async () =>
            save(
              await shopApi<Cart>(
                "/store-api/checkout/currency",
                { currency, revision: cart.revision },
                cart.token,
                "PUT",
              ),
            ),
          );
        }}
      >
        {cart.availableCurrencies?.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </label>
  );
}
