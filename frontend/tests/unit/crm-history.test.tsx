/** Regression paths for independent defaults, linked CRM entities, scoped navigation and actual history restoration requests. */
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import AddressBook from "../../src/shared/customer/AddressBook";
import EntityHistory from "../../src/shared/history/EntityHistory";
import { changes, printable } from "../../src/shared/history/history-model";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { useEntityNavigation } from "../../src/admin/shell/useEntityNavigation";
import OrderDetail from "../../src/admin/orders/OrderDetail";
import CustomersManager from "../../src/admin/customers/CustomersManager";
import CustomerGroupsSettings from "../../src/admin/settings/CustomerGroupsSettings";
import type { Tab } from "../../src/admin/shell/navigation";
const address = {
  name: "Unit Buyer",
  firstName: "Unit",
  lastName: "Buyer",
  street: "Unit Lane",
  city: "Berlin",
  country: "DE",
  postalCode: "10115",
};
it("sets billing and shipping defaults independently from the cards, and confirms deletion", async () => {
  let book = {
    elements: [
      { id: "billing", revision: 1, address },
      {
        id: "shipping",
        revision: 1,
        address: { ...address, street: "Shipping Lane" },
      },
    ],
    defaultBillingAddressId: "billing",
    defaultShippingAddressId: "shipping",
  };
  const request = vi.fn(async (path: string, body?: any, method?: string) => {
    if (method === "PUT") {
      if (body.defaultBilling)
        book.defaultBillingAddressId = path.split("/").at(-1)!;
      if (body.defaultShipping)
        book.defaultShippingAddressId = path.split("/").at(-1)!;
    }
    if (method === "DELETE")
      book.elements = book.elements.filter(
        (e) => e.id !== path.split("/").at(-1),
      );
    return structuredClone(book);
  });
  render(
    <AddressBook request={request} path="/addresses" countries={["DE"]} />,
    { wrapper: LocaleProvider },
  );
  const user = userEvent.setup();
  await screen.findByText("Shipping Lane");
  await user.click(
    screen.getByRole("button", { name: "Use as default billing address" }),
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/addresses/shipping",
      expect.objectContaining({
        revision: 1,
        defaultBilling: true,
        defaultShipping: false,
      }),
      "PUT",
    ),
  );
  expect(book.defaultShippingAddressId).toBe("shipping");
  await user.click(
    screen.getByRole("button", { name: "Use as default delivery address" }),
  );
  await waitFor(() => expect(book.defaultShippingAddressId).toBe("billing"));
  expect(book.defaultBillingAddressId).toBe("shipping");
  await user.click(screen.getAllByRole("button", { name: /^Delete$/ })[0]);
  expect(request.mock.calls.filter((c) => c[2] === "DELETE")).toHaveLength(0);
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: /^Delete$/,
    }),
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/addresses/billing",
      { revision: 1 },
      "DELETE",
    ),
  );
});
it("keeps native customer/order/product back paths and clears the selected entity on shop changes", () => {
  const allowed: Tab[] = ["customers", "orders", "productData", "assistant"];
  const { result, rerender } = renderHook(
    ({ scope }) => useEntityNavigation(scope, allowed),
    { initialProps: { scope: "shop-one" } },
  );
  act(() => result.current.selectTab("customers"));
  act(() => result.current.openEntity("customers", "buyer@example.test"));
  act(() => result.current.openEntity("orders", "order-one"));
  expect(result.current.entityTarget).toEqual({
    tab: "orders",
    id: "order-one",
  });
  expect(new URLSearchParams(location.search).get("entity")).toBe("order-one");
  act(() => result.current.openEntity("productData", "mug"));
  act(() => result.current.entityBack());
  expect(result.current.entityTarget?.id).toBe("order-one");
  act(() => result.current.entityBack());
  expect(result.current.entityTarget?.id).toBe("buyer@example.test");
  rerender({ scope: "shop-two" });
  expect(result.current.entityTarget).toBeUndefined();
  expect(location.search).not.toContain("entity=");
});
it("opens a related order directly and uses configured translated customer groups", async () => {
  const open = vi.fn();
  const customer = {
    email: "buyer@example.test",
    customerNumber: "C-UNIT",
    revision: 2,
    profile: { name: "Buyer" },
    company: null,
    customerGroup: "vip",
    active: true,
    orders: [
      {
        id: "order-one",
        orderNumber: "ORDER-ONE",
        state: "placed",
        cart: { price: { totalPrice: 12 } },
      },
    ],
  };
  const request = vi.fn(async (path: string) => {
    if (path === "/api/auth/access")
      return {
        permissions: ["customers.read", "customers.write", "orders.read"],
      };
    if (path === "/api/merchant/customer-groups")
      return {
        elements: [
          {
            id: "vip",
            priceBasis: "business",
            translations: { "en-GB": { name: "VIP trade" } },
          },
        ],
        mainLocale: "en-GB",
      };
    if (path === "/store-api/checkout/options") return { countries: ["DE"] };
    if (path.endsWith("/addresses"))
      return { elements: [], customerRevision: 2 };
    if (path.includes("?")) return { elements: [customer] };
    return structuredClone(customer);
  });
  render(
    <CustomersManager
      request={request}
      initialEmail={customer.email}
      onEntity={open}
    />,
    { wrapper: LocaleProvider },
  );
  await screen.findByText("C-UNIT", { exact: false });
  expect(
    await screen.findByRole("option", { name: "VIP trade" }),
  ).toBeInTheDocument();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /ORDER-ONE/ }));
  expect(open).toHaveBeenCalledWith("orders", "order-one");
});
it("history stays lazy, shows exact changes and sends one explicitly confirmed revision-bound restore", async () => {
  const entry = {
    id: 7,
    revision: 2,
    createdAt: "2026-10-05T10:00:00Z",
    actor: "owner",
    actorLabel: "Unit Owner",
    source: "merchant",
    hasPrevious: true,
  };
  const request = vi.fn(async (path: string, _body?: unknown) => {
    if (path.endsWith("/restore")) return { revision: 3 };
    if (path.endsWith("/7"))
      return {
        id: 7,
        before: { name: "Original" },
        after: { name: "Changed" },
      };
    return { elements: [entry], canRestore: true, nextCursor: null };
  });
  const restored = vi.fn(async () => {}),
    user = userEvent.setup();
  render(
    <EntityHistory
      request={request}
      entity="product"
      id="mug"
      revision={2}
      onRestored={restored}
    />,
    { wrapper: LocaleProvider },
  );
  expect(request).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /Version history/ }));
  await user.click(await screen.findByRole("button", { name: /Unit Owner/ }));
  expect(screen.getByText("Original")).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Restore previous state" }),
  );
  expect(
    request.mock.calls.filter((c) => c[0].endsWith("/restore")),
  ).toHaveLength(0);
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Restore version",
    }),
  );
  await waitFor(() => expect(restored).toHaveBeenCalledTimes(1));
  expect(request).toHaveBeenCalledWith("/api/history/product/mug/7/restore", {
    approve: true,
    revision: 2,
    side: "before",
  });
  expect(
    await screen.findByText("Version restored as a new revision"),
  ).toBeInTheDocument();
});
it("disables dirty rollback and preserves a failed restoration for explicit retry", async () => {
  const request = vi.fn(async (path: string) => {
    if (path.endsWith("/restore")) throw new Error("Current revision changed");
    if (path.endsWith("/8"))
      return { id: 8, before: { active: true }, after: { active: false } };
    return {
      elements: [
        {
          id: 8,
          revision: 2,
          createdAt: "2026-10-05",
          actor: "Unit",
          source: "merchant",
          hasPrevious: true,
        },
      ],
      canRestore: true,
    };
  });
  const restored = vi.fn(async () => {}),
    user = userEvent.setup();
  const { rerender } = render(
    <EntityHistory
      request={request}
      entity="customer"
      id="unit@example.test"
      revision={2}
      dirty
      onRestored={restored}
    />,
    { wrapper: LocaleProvider },
  );
  await user.click(screen.getByRole("button", { name: /Version history/ }));
  await user.click(await screen.findByRole("button", { name: /Unit/ }));
  expect(
    screen.getByRole("button", { name: "Restore previous state" }),
  ).toBeDisabled();
  rerender(
    <EntityHistory
      request={request}
      entity="customer"
      id="unit@example.test"
      revision={2}
      onRestored={restored}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Restore previous state" }),
  );
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Restore version",
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Current revision changed",
  );
  expect(restored).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
it("compares inherited/explicit empty fields without executing content, ignores bookkeeping and bounds large changes", () => {
  expect(
    changes({ revision: 1, name: null }, { revision: 2, name: "" }),
  ).toEqual([{ path: "name", before: null, after: "" }]);
  expect(printable("<img onerror=alert(1)>")).toContain("onerror");
  expect(printable(null)).toBe("—");
  expect(
    changes(
      {},
      Object.fromEntries(Array.from({ length: 500 }, (_, i) => [i, i])),
    ),
  ).toHaveLength(300);
});
it("creates translated groups in the single-language editor and retains a rejected dependent deletion", async () => {
  const config = {
    mainLocale: "en-GB",
    locales: ["en-GB", "de-DE", "es-ES"],
    customerGroups: [
      {
        id: "consumer",
        priceBasis: "consumer",
        translations: { "en-GB": { name: "Consumers" } },
      },
      {
        id: "business",
        priceBasis: "business",
        translations: { "en-GB": { name: "Business" } },
      },
    ],
  };
  const request = vi.fn(async (_path: string, _v?: any, method?: string) => {
    if (method === "PUT")
      throw new Error("Customer group is assigned to customers");
    return { data: structuredClone(config), revision: 1 };
  });
  render(<CustomerGroupsSettings request={request} canWrite />, {
    wrapper: LocaleProvider,
  });
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: /Add customer group/ }),
  );
  expect(screen.getAllByLabelText("Name")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Customer group is assigned to customers",
  );
  expect(
    request.mock.calls.find((c) => c[2] === "PUT")?.[1].data.customerGroups,
  ).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
});

it("links legacy product positions and registered customers, while promotions and missing read rights stay plain", async () => {
  const customer = vi.fn(),
    product = vi.fn();
  const order = {
    id: "legacy",
    revision: 1,
    orderNumber: "LEGACY",
    customerEmail: "buyer@example.test",
    createdAt: "2026-10-05T10:00:00Z",
    state: "placed",
    orderCustomer: { customerId: "own" },
    workflow: { states: [], actions: [] },
    activity: [],
    payment: { state: "authorized", simulated: true },
    deliveries: [],
    cart: {
      price: { totalPrice: 12 },
      lineItems: [
        {
          id: "mug",
          referencedId: "mug",
          label: "Legacy mug",
          quantity: 1,
          price: { totalPrice: 12 },
        },
        {
          id: "promo",
          referencedId: "promo",
          type: "promotion",
          label: "Discount",
          quantity: 1,
          price: { totalPrice: -1 },
        },
      ],
    },
  };
  const request = vi.fn(async (path: string) =>
    path.endsWith("/legacy") ? order : { elements: [] },
  );
  const props = {
    id: "legacy",
    request,
    onBack: vi.fn(),
    download: vi.fn(),
    onCustomer: customer,
    onProduct: product,
  };
  const view = render(
    <OrderDetail {...props} rights={["catalog.read", "customers.read"]} />,
    { wrapper: LocaleProvider },
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Legacy mug" }));
  expect(product).toHaveBeenCalledWith("mug");
  await user.click(screen.getByRole("button", { name: "buyer@example.test" }));
  expect(customer).toHaveBeenCalledWith("buyer@example.test");
  expect(screen.queryByRole("button", { name: "Discount" })).toBeNull();
  view.rerender(<OrderDetail {...props} rights={[]} />);
  expect(screen.queryByRole("button", { name: "Legacy mug" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "buyer@example.test" }),
  ).toBeNull();
});
