/** Address book, guest contact and delivery/payment selection share the authoritative cart context API. */
import { useEffect, useState } from "react";
import { shopApi, type Cart, type Selection } from "../../shared/api/shop-api";
import AddressFields from "../../shared/customer/AddressFields";
import {
  emptyAddress,
  type AddressList,
} from "../../shared/customer/customer-types";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useCheckoutText } from "../../shared/i18n/checkout-i18n";
import CheckoutMethods from "./CheckoutMethods";
import CheckoutIdentity from "./CheckoutIdentity";
export default function CheckoutDetails({
  cart,
  selection,
  onChange,
  onCart,
  onSubmit,
  busy,
}: {
  cart: Cart;
  selection: Selection;
  onChange: (p: Partial<Selection>) => void;
  onCart: (c: Cart) => void;
  onSubmit: () => Promise<void>;
  busy: boolean;
}) {
  const { c } = useCustomerText();
  const { x } = useCheckoutText();
  const [book, setBook] = useState<AddressList>(),
    [same, setSame] = useState(
      !selection.address ||
        JSON.stringify(selection.address) ===
          JSON.stringify(selection.billingAddress),
    ),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setSame(
      !cart.checkout.address ||
        JSON.stringify(cart.checkout.address) ===
          JSON.stringify(cart.checkout.billingAddress),
    );
  }, [cart.customerId, cart.token]);
  const load = async () => {
    if (cart.customerId)
      setBook(await shopApi<AddressList>("/store-api/account/addresses"));
    else setBook(undefined);
  };
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [cart.customerId, cart.token]);
  const choose = (kind: "billing" | "shipping", id: string) => {
    const ad =
      book?.elements.find((a) => a.id === id)?.address ??
      emptyAddress(selection.country);
    if (kind === "billing")
      onChange({
        billingAddressId: id || null,
        billingAddress: ad,
        ...(same
          ? {
              address: ad,
              shippingAddressId: id || null,
              country: ad.country ?? selection.country,
            }
          : {}),
      });
    else
      onChange({
        shippingAddressId: id || null,
        address: ad,
        country: ad.country ?? selection.country,
      });
  };
  const selector = (kind: "billing" | "shipping") =>
    book && (
      <label>
        {c(kind === "billing" ? "billingAddress" : "shippingAddress")}
        <select
          value={
            (kind === "billing"
              ? selection.billingAddressId
              : selection.shippingAddressId) ?? ""
          }
          onChange={(e) => choose(kind, e.target.value)}
        >
          <option value="">{c("newAddress")}</option>
          {book.elements.map((v) => (
            <option key={v.id} value={v.id}>
              {v.address.name} · {v.address.street}, {v.address.city}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <section className="checkout-details">
      <CheckoutIdentity
        cart={cart}
        onCart={onCart}
        onSigned={() => void load()}
      />
      <form
        id="checkout-details"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            await onSubmit();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <h3>{x("contact")}</h3>
        <label>
          {c("email")}
          <input
            type="email"
            required
            value={selection.customerEmail ?? cart.customerEmail ?? ""}
            disabled={busy || saving || !!cart.customerId}
            autoComplete="email"
            onChange={(e) => onChange({ customerEmail: e.target.value })}
          />
        </label>
        {selector("billing")}
        <h4>{c("billingAddress")}</h4>
        <AddressFields
          googleAutocomplete
          autoCompleteSection="billing"
          value={selection.billingAddress}
          countries={cart.availableCountries}
          disabled={busy || saving}
          onChange={(ad) =>
            onChange({
              billingAddress: ad,
              billingAddressId: null,
              ...(same
                ? {
                    address: ad,
                    shippingAddressId: null,
                    country: ad.country ?? selection.country,
                  }
                : {}),
            })
          }
        />
        <label className="customer-checkbox">
          <input
            type="checkbox"
            checked={same}
            onChange={(e) => {
              setSame(e.target.checked);
              if (e.target.checked)
                onChange({
                  address: selection.billingAddress,
                  shippingAddressId: selection.billingAddressId,
                  country:
                    selection.billingAddress?.country ?? selection.country,
                });
            }}
          />
          {c("sameAddress")}
        </label>
        {!same && (
          <>
            {selector("shipping")}
            <h4>{c("shippingAddress")}</h4>
            <AddressFields
              googleAutocomplete
              autoCompleteSection="shipping"
              value={selection.address}
              countries={cart.availableCountries}
              disabled={busy || saving}
              onChange={(ad) =>
                onChange({
                  address: ad,
                  shippingAddressId: null,
                  country: ad.country ?? selection.country,
                })
              }
            />
          </>
        )}
        <h3>{x("methods")}</h3>
        <CheckoutMethods
          cart={cart}
          selection={selection}
          onChange={onChange}
          disabled={busy || saving}
        />
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}
