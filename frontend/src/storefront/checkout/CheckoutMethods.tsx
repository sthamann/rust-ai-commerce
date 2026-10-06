/** Method cards keep delivery and payment discoverable without concealing country restrictions. */
import type { Cart, Selection } from "../../shared/api/shop-api";
import { useShopText } from "../../shared/i18n/shop-i18n";
import { useCheckoutText } from "../../shared/i18n/checkout-i18n";
export default function CheckoutMethods({
  cart,
  selection,
  onChange,
  disabled,
}: {
  cart: Cart;
  selection: Selection;
  onChange: (p: Partial<Selection>) => void;
  disabled: boolean;
}) {
  const { s, money } = useShopText();
  const { x } = useCheckoutText();
  const shipping = (
    cart.shippingMethodOptions ?? cart.availableShippingMethods
  ).filter((v) => v.countries.includes(selection.country));
  const payments = (
    cart.paymentMethodOptions ?? cart.availablePaymentMethods
  ).filter(
    (v) =>
      (!v.restrictedCountries && !v.countries?.length) ||
      v.countries?.includes(selection.country),
  );
  return (
    <div className="checkout-methods">
      {[
        {
          key: "shippingMethodId" as const,
          title: s("shipping"),
          methods: shipping,
        },
        {
          key: "paymentMethodId" as const,
          title: s("payment"),
          methods: payments,
        },
      ].map((group) => (
        <fieldset key={group.key} disabled={disabled}>
          <legend>{group.title}</legend>
          {!group.methods.length && <p role="status">{x("unavailable")}</p>}
          {group.methods.map((method) => (
            <label
              className={`checkout-method ${selection[group.key] === method.id ? "selected" : ""}`}
              key={method.id}
            >
              <input
                type="radio"
                name={group.key}
                value={method.id}
                checked={selection[group.key] === method.id}
                onChange={() => onChange({ [group.key]: method.id })}
                required
              />
              <span>
                <strong>{s(method.name)}</strong>
                {method.description && <small>{method.description}</small>}
                {"mode" in method && method.mode === "simulated" && (
                  <small>{x("test")}</small>
                )}
              </span>
              {"price" in method && <strong>{money(method.price)}</strong>}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
