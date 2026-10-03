/** Address book, guest contact and delivery/payment selection share the authoritative cart context API. */
import { useEffect, useState } from "react";
import { shopApi, type Cart, type Selection } from "../../shared/api/shop-api";
import AddressFields from "../../shared/customer/AddressFields";
import {
  addressComplete,
  emptyAddress,
  type AddressList,
} from "../../shared/customer/customer-types";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useShopText } from "../../shared/i18n/shop-i18n";
import CheckoutIdentity from "./CheckoutIdentity";
export default function CheckoutDetails({
  cart,
  selection,
  onChange,
  onCart,
  onSave,
  busy,
  dirty,
}: {
  cart: Cart;
  selection: Selection;
  onChange: (p: Partial<Selection>) => void;
  onCart: (c: Cart) => void;
  onSave: () => Promise<void>;
  busy: boolean;
  dirty: boolean;
}) {
  const { c } = useCustomerText(),
    { s, money } = useShopText();
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
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            await onSave();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
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
        <h3>{c("checkoutAddresses")}</h3>
        {selector("billing")}
        <h4>{c("billingAddress")}</h4>
        <AddressFields
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
        <h3>{c("checkoutMethods")}</h3>
        <div className="customer-field-grid">
          <label>
            {s("shipping")}
            <select
              value={selection.shippingMethodId}
              disabled={busy || saving}
              onChange={(e) => onChange({ shippingMethodId: e.target.value })}
            >
              {cart.availableShippingMethods
                .filter((v) => v.countries.includes(selection.country))
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {s(v.name)} · {money(v.price)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {s("payment")}
            <select
              value={selection.paymentMethodId}
              disabled={busy || saving}
              onChange={(e) => onChange({ paymentMethodId: e.target.value })}
            >
              {cart.availablePaymentMethods.map((v) => (
                <option key={v.id} value={v.id}>
                  {s(v.name)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>{c("checkoutHint")}</p>
        <button
          className="shop-secondary"
          disabled={
            busy ||
            saving ||
            !dirty ||
            !addressComplete(selection.billingAddress)
          }
        >
          {saving ? s("processing") : s("saveSelection")}
        </button>
        {dirty && <small>{s("unsaved")}</small>}
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}
