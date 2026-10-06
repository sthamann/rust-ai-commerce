/** Account purchase care is exercised through real shopApi headers, navigation, binary downloads and expired sessions. */
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import CustomerAccount from "../../src/storefront/account/CustomerAccount";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { cart } from "./fixtures";
const token = "synthetic-purchase-session";
const response = (v: unknown, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => v,
});
const address = {
  name: "Test Customer",
  firstName: "Test",
  lastName: "Customer",
  street: "Fixture Lane 1",
  postalCode: "10115",
  city: "Berlin",
  country: "DE",
};
const order = {
  id: "own-order",
  orderNumber: "INV-OWN-42",
  revision: 2,
  state: "processing",
  createdAt: "2026-10-06T12:00:00Z",
  cart: {
    ...cart,
    lineItems: [
      {
        id: "coat",
        label: "Test coat",
        quantity: 1,
        price: { unitPrice: 79, totalPrice: 79 },
      },
    ],
    price: { ...cart.price, positionPrice: 79, totalPrice: 83.9, tax: 13.4 },
    shippingCosts: { totalPrice: 4.9 },
  },
  payment: {
    state: "authorized",
    provider: "simulated",
    method: { name: "Demo card" },
  },
  billingAddress: address,
  shippingAddress: address,
  deliveries: [
    {
      state: "shipped",
      trackingCode: "TRACK-42",
      trackingUrl: "https://tracking.example.test/42",
      shippingMethod: { name: "Standard delivery" },
      deliveryDate: { earliest: "2026-10-07", latest: "2026-10-09" },
    },
  ],
  receipts: [
    {
      id: "receipt-own",
      kind: "invoice",
      number: "INV-0042",
      createdAt: "2026-10-06",
    },
  ],
};
const file = {
  id: "guide",
  orderId: "own-order",
  filename: "care-guide.pdf",
  name: "Care guide",
  title: { en: "Care guide" },
};
function fixture(extra?: (path: string, init: RequestInit) => unknown) {
  localStorage.setItem("rac-customer:unit-shop", token);
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    const custom = extra?.(path, init);
    if (custom) return custom;
    if (path === "/api/apps/surfaces") return response({ surfaces: [] });
    expect(new Headers(init.headers).get("x-customer-token")).toBe(token);
    const replies: Record<string, unknown> = {
      "/store-api/account/profile": {
        email: "buyer@example.test",
        customerNumber: "C-OWN",
        revision: 1,
        profile: {
          name: address.name,
          firstName: "Test",
          lastName: "Customer",
        },
        addresses: {
          elements: [{ id: "home", revision: 1, address }],
          defaultBillingAddressId: "home",
          defaultShippingAddressId: "home",
        },
      },
      "/store-api/checkout/options": { countries: ["DE"], payments: [] },
      "/store-api/account/downloads": { elements: [file] },
      "/store-api/account/orders": { elements: [order] },
      "/store-api/account/orders/own-order": order,
      "/store-api/account/addresses": {
        elements: [{ id: "home", revision: 1, address }],
        defaultBillingAddressId: "home",
        defaultShippingAddressId: "home",
      },
    };
    if (!(path in replies)) throw new Error(`Missing purchase fixture ${path}`);
    return response(replies[path]);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
const mount = () =>
  render(<CustomerAccount cart={cart} onCart={() => {}} onClose={() => {}} />, {
    wrapper: LocaleProvider,
  });
it("opens a purchase, its address snapshots, current shipping and an authenticated invoice download", async () => {
  const fetcher = fixture((path) =>
    path.endsWith("/pdf")
      ? {
          ok: true,
          blob: async () => new Blob(["%PDF synthetic"]),
          headers: new Headers({
            "content-disposition": "attachment; filename=receipt.pdf",
          }),
        }
      : undefined,
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-receipt");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "View order INV-OWN-42" }),
  );
  expect(await screen.findByText(/INV-0042/)).toBeInTheDocument();
  expect(screen.getAllByText("Fixture Lane 1")).toHaveLength(2);
  expect(screen.getByRole("link", { name: /Track shipment/ })).toHaveAttribute(
    "href",
    "https://tracking.example.test/42",
  );
  expect(screen.getByText("TRACK-42")).toBeInTheDocument();
  await user.click(screen.getAllByRole("button", { name: "Download" })[0]);
  const call = fetcher.mock.calls.find(
    ([path]) =>
      path === "/store-api/account/orders/own-order/receipts/receipt-own/pdf",
  );
  expect(call).toBeDefined();
  expect(new Headers(call![1].headers).get("x-customer-token")).toBe(token);
  expect(new Headers(call![1].headers).has("Authorization")).toBe(false);
});
it.each([
  "javascript:alert(1)",
  "https://user:secret@example.test/track",
  "http://tracking.example.test/42",
])("never renders an unsafe tracking link (%s)", async (trackingUrl) => {
  fixture((path) =>
    path === "/store-api/account/orders/own-order"
      ? response({
          ...order,
          deliveries: [{ ...order.deliveries[0], trackingUrl }],
        })
      : undefined,
  );
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "View order INV-OWN-42" }),
  );
  await screen.findByText("TRACK-42");
  expect(
    screen.queryByRole("link", { name: /Track shipment/ }),
  ).not.toBeInTheDocument();
});
it("navigates to the shared address book and clears private data when the session expires", async () => {
  let expired = false;
  fixture((path) =>
    expired && path === "/store-api/account/profile"
      ? response({ errors: [{ detail: "Customer session expired" }] }, 401)
      : undefined,
  );
  mount();
  const user = userEvent.setup();
  await screen.findByText("C-OWN", { exact: false });
  const nav = screen.getByRole("navigation", { name: "Your account" });
  await user.click(within(nav).getByRole("button", { name: "Addresses" }));
  expect(
    await screen.findByRole("button", { name: "Add address" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Default billing address")).toBeInTheDocument();
  expect(screen.getByText("Default shipping address")).toBeInTheDocument();
  expired = true;
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Your session has expired",
  );
  expect(screen.queryByText("buyer@example.test")).not.toBeInTheDocument();
  expect(localStorage.getItem("rac-customer:unit-shop")).toBeNull();
  expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
});
it("downloads a paid entitlement using the owner session without embedding credentials in the URL", async () => {
  const fetcher = fixture((path) =>
    path === "/store-api/orders/own-order/downloads/guide"
      ? {
          ok: true,
          blob: async () => new Blob(["synthetic guide"]),
          headers: new Headers({
            "content-disposition": "attachment; filename=guide.pdf",
          }),
        }
      : undefined,
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-file");
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  mount();
  const user = userEvent.setup();
  await screen.findByText("C-OWN", { exact: false });
  await user.click(
    within(screen.getByRole("navigation", { name: "Your account" })).getByRole(
      "button",
      { name: "Downloads" },
    ),
  );
  expect(await screen.findByText("Care guide")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Download" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([path]) => path === "/store-api/orders/own-order/downloads/guide",
      ),
    ).toBe(true),
  );
});

it("loads older orders without losing current purchases or leaking the customer session into the cursor URL", async () => {
  const fetcher = fixture((path) => {
    if (path === "/store-api/account/orders")
      return response({ elements: [order], nextCursor: "own-order" });
    if (path === "/store-api/account/orders?after=own-order")
      return response({
        elements: [{ ...order, id: "older-order", orderNumber: "INV-OLDER-1" }],
        nextCursor: null,
      });
  });
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Orders" }));
  await user.click(screen.getByRole("button", { name: "Load older orders" }));
  expect(
    await screen.findByRole("button", { name: "View order INV-OLDER-1" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "View order INV-OWN-42" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Load older orders" }),
  ).not.toBeInTheDocument();
  const call = fetcher.mock.calls.find(([path]) => path.includes("?after="));
  expect(new Headers(call![1].headers).get("x-customer-token")).toBe(token);
});

it("keeps an authenticated account open when the current password is incorrect", async () => {
  fixture((path) =>
    path === "/store-api/account/password"
      ? response({ errors: [{ detail: "Invalid credentials" }] }, 401)
      : undefined,
  );
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Security" }));
  await user.type(screen.getByLabelText("Current password"), "wrong-password");
  await user.type(
    screen.getByLabelText("New password"),
    "Synthetic-replacement-2026!",
  );
  await user.click(screen.getByRole("button", { name: "Change password" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Email or password is incorrect.",
  );
  expect(localStorage.getItem("rac-customer:unit-shop")).toBe(token);
  expect(screen.getByLabelText("Current password")).toBeInTheDocument();
});

it("uses translated configurable state labels for the purchased order and its delivery", async () => {
  fixture((path) =>
    path === "/store-api/account/orders/own-order"
      ? response({
          ...order,
          stateLabels: {
            processing: { en: "Being prepared" },
            shipped: { en: "On its way" },
          },
        })
      : undefined,
  );
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "View order INV-OWN-42" }),
  );
  expect(await screen.findByText("Being prepared")).toBeInTheDocument();
  expect(screen.getByText("On its way")).toBeInTheDocument();
});
