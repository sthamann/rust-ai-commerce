/** Read-only checkout snapshots distinguish guest contacts from authenticated customer accounts. */
import AddressCard from "../../shared/customer/AddressCard";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useCrmText } from "../../shared/i18n/crm-i18n";
export default function GuestContact({ customer }: { customer: any }) {
  const { c } = useCustomerText();
  const { r } = useCrmText();
  return (
    <section className="customer-address-book">
      <p className="muted">{r("guestHint")}</p>
      <div className="customer-address-grid">
        {customer.billingAddress && (
          <article>
            <h3>{c("billingAddress")}</h3>
            <AddressCard address={customer.billingAddress} />
          </article>
        )}
        {customer.shippingAddress && (
          <article>
            <h3>{c("shippingAddress")}</h3>
            <AddressCard address={customer.shippingAddress} />
          </article>
        )}
      </div>
    </section>
  );
}
