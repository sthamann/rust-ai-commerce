/** Guest CRM uses immutable purchase contacts and native order navigation without account mutation controls. */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import CustomersManager from "../../src/admin/customers/CustomersManager";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
const guest = {
  id: null,
  email: "guest@example.test",
  guest: true,
  active: false,
  profile: { name: "Guest Buyer" },
  customerGroup: "consumer",
  billingAddress: {
    name: "Guest Buyer",
    street: "Billing Lane 1",
    city: "Berlin",
    postalCode: "10115",
    country: "DE",
  },
  shippingAddress: {
    name: "Guest Buyer",
    street: "Delivery Lane 2",
    city: "Berlin",
    postalCode: "10115",
    country: "DE",
  },
  orders: [
    {
      id: "guest-order",
      orderNumber: "GUEST-ORDER",
      state: "placed",
      cart: { price: { totalPrice: 42 } },
    },
  ],
};
it("opens guest buyers, shows purchase addresses and links orders without account mutation controls", async () => {
  const open = vi.fn();
  const request = vi.fn(async (path: string) => {
    if (path === "/api/auth/access")
      return {
        permissions: ["customers.read", "customers.write", "orders.read"],
      };
    if (path === "/api/merchant/customer-groups")
      return { elements: [], mainLocale: "en-GB" };
    if (path === "/store-api/checkout/options") return { countries: ["DE"] };
    if (path.includes("?")) return { elements: [guest] };
    return structuredClone(guest);
  });
  const view = render(<CustomersManager request={request} onEntity={open} />, {
    wrapper: LocaleProvider,
  });
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: /Guest Buyer/ }));
  expect(open).toHaveBeenCalledWith("customers", guest.email);
  view.rerender(
    <CustomersManager
      request={request}
      onEntity={open}
      initialEmail={guest.email}
    />,
  );
  await screen.findByText("Billing Lane 1");
  expect(screen.getByText("Delivery Lane 2")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Save|Add address|Version history/ }),
  ).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /GUEST-ORDER/ }));
  expect(open).toHaveBeenCalledWith("orders", "guest-order");
  expect(request.mock.calls.some(([path]) => path.endsWith("/addresses"))).toBe(
    false,
  );
});
