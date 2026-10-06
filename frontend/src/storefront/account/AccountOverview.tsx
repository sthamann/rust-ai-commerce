/** Account home connects recent purchases and default addresses to their dedicated management views. */
import { useAccountText } from "../../shared/i18n/account-i18n";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import AddressCard from "../../shared/customer/AddressCard";
import AccountOrderList from "./AccountOrderList";
import type {
  AccountProfile,
  AccountPage,
  CustomerOrder,
} from "./account-types";
export default function AccountOverview({
  profile,
  orders,
  downloads,
  onPage,
  onOrder,
  onShop,
}: {
  profile: AccountProfile;
  orders: CustomerOrder[];
  downloads: number;
  onPage: (page: AccountPage) => void;
  onOrder: (id: string) => void;
  onShop: () => void;
}) {
  const { a } = useAccountText(),
    { c } = useCustomerText();
  const book = profile.addresses;
  return (
    <>
      <div className="account-welcome">
        <small>{a("welcome")}</small>
        <h2>
          {profile.profile.firstName || profile.profile.name || profile.email}
        </h2>
        <p>{a("intro")}</p>
      </div>
      <div className="account-metrics">
        {(
          [
            ["orders", profile.orderCount ?? orders.length],
            ["addresses", book?.elements.length ?? 0],
            ["downloads", downloads],
          ] as const
        ).map(([page, count]) => (
          <button key={page} onClick={() => onPage(page)}>
            <strong>{count}</strong>
            <span>{a(page)}</span>
            <span aria-hidden="true">↗</span>
          </button>
        ))}
      </div>
      <div className="account-section-toolbar">
        <h3>{a("recentOrders")}</h3>
        <button
          className="account-text-button"
          onClick={() => onPage("orders")}
        >
          {a("allOrders")} →
        </button>
      </div>
      <AccountOrderList
        orders={orders.slice(0, 2)}
        onSelect={onOrder}
        onShop={onShop}
      />
      <div className="account-section-toolbar">
        <h3>{a("defaultAddresses")}</h3>
        <button
          className="account-text-button"
          onClick={() => onPage("addresses")}
        >
          {a("manageAddresses")} →
        </button>
      </div>
      <div className="customer-address-grid">
        {(
          [
            ["billingAddress", book?.defaultBillingAddressId],
            ["shippingAddress", book?.defaultShippingAddressId],
          ] as const
        ).map(([kind, id]) => (
          <section className="account-panel" key={kind}>
            <h4>{c(kind)}</h4>
            {id ? (
              <AddressCard
                address={
                  book?.elements.find((entry) => entry.id === id)?.address
                }
              />
            ) : (
              <button
                className="account-text-button"
                onClick={() => onPage("addresses")}
              >
                {c("addAddress")} →
              </button>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
