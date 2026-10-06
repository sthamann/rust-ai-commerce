/** Account composition must persist the tenant session before loading protected profile, addresses and orders. */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import CustomerAccount from "../../src/storefront/account/CustomerAccount";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { cart } from "./fixtures";
const email = "customer@example.test";
const password = "Synthetic-account-2026!";
const token = "fixture-customer-session";
const address = {
  name: "Unit Customer",
  firstName: "Unit",
  lastName: "Customer",
  street: "Fixture Street 1",
  postalCode: "10115",
  city: "Berlin",
  country: "DE",
};
const response = (value: unknown, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => value,
});
it.each([
  { register: false, noCart: false },
  { register: true, noCart: false },
  { register: false, noCart: true },
])(
  "loads authenticated account data after submitting the form ($register, no cart=$noCart)",
  async ({ register, noCart }) => {
    const fetcher = vi.fn(async (path: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      expect(headers.get("x-tenant")).toBe("unit-shop");
      expect(headers.has("Authorization")).toBe(false);
      if (path === "/api/apps/surfaces") return response({ surfaces: [] });
      if (path === "/store-api/checkout/cart") return response(cart);
      if (path === "/store-api/account/register") {
        expect(JSON.parse(String(init.body))).toMatchObject({
          email,
          password,
        });
        return response({ customerToken: "registration-session" });
      }
      if (path === "/store-api/account/login") {
        expect(JSON.parse(String(init.body))).toEqual({ email, password });
        expect(headers.get("sw-context-token")).toBe(cart.token);
        return response({
          ...cart,
          token: "rotated-context",
          customerToken: token,
        });
      }
      // No mocked helper: actual shopApi must read the session stored by the form.
      if (headers.get("x-customer-token") !== token)
        return response(
          { errors: [{ detail: "Customer session expired" }] },
          401,
        );
      const replies: Record<string, unknown> = {
        "/store-api/account/profile": {
          email,
          customerNumber: "C-UNIT",
          revision: 1,
          profile: {
            name: address.name,
            firstName: "Unit",
            lastName: "Customer",
          },
        },
        "/store-api/checkout/options": { countries: ["DE"], payments: [] },
        "/store-api/account/downloads": { elements: [] },
        "/store-api/account/orders": {
          elements: [
            {
              id: "owned",
              orderNumber: "RAC-OWNED",
              cart,
              state: "open",
              payment: { state: "authorized" },
            },
          ],
        },
        "/store-api/account/addresses": {
          elements: [{ id: "home", revision: 1, address }],
          defaultBillingAddressId: "home",
          defaultShippingAddressId: "home",
          customerRevision: 1,
        },
      };
      if (!(path in replies))
        throw new Error(`Unspecified account fixture: ${path}`);
      return response(replies[path]);
    });
    vi.stubGlobal("fetch", fetcher);
    const onCart = vi.fn();
    render(
      <CustomerAccount
        cart={noCart ? undefined : cart}
        onCart={onCart}
        onClose={() => {}}
      />,
      {
        wrapper: LocaleProvider,
      },
    );
    const user = userEvent.setup();
    if (register) {
      await user.click(screen.getByRole("button", { name: "Create account" }));
      await user.type(screen.getByLabelText("First name"), "Unit");
      await user.type(screen.getByLabelText("Last name"), "Customer");
    }
    await user.type(screen.getByLabelText("Email"), email);
    await user.type(screen.getByLabelText(/Password/), password);
    await user.click(
      screen
        .getAllByRole("button", {
          name: register ? "Create account" : /Sign in/,
        })
        .at(-1)!,
    );
    expect(await screen.findByText(/C-UNIT/)).toBeInTheDocument();

    expect(await screen.findByText(/RAC-OWNED/)).toBeInTheDocument();
    expect(localStorage.getItem("rac-customer:unit-shop")).toBe(token);
    expect(localStorage.getItem("undefined")).toBeNull();
    expect(onCart).toHaveBeenCalledWith(
      expect.objectContaining({ token: "rotated-context" }),
    );
    expect(
      fetcher.mock.calls.filter(
        ([path]) => path === "/store-api/account/register",
      ),
    ).toHaveLength(register ? 1 : 0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  },
);

it("explains an existing registration and keeps the entered information without attempting a login", async () => {
  const fetcher = vi.fn(async () =>
    response({ errors: [{ detail: "Account already exists" }] }, 409),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<CustomerAccount cart={cart} onCart={() => {}} onClose={() => {}} />, {
    wrapper: LocaleProvider,
  });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Create account" }));
  await user.type(screen.getByLabelText("First name"), "Unit");
  await user.type(screen.getByLabelText("Last name"), "Customer");
  await user.type(screen.getByLabelText("Email"), "exists@example.test");
  await user.type(
    screen.getByLabelText("Password"),
    "Synthetic-existing-2026!",
  );
  await user.click(
    screen.getAllByRole("button", { name: "Create account" }).at(-1)!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "An account with this email already exists. Sign in instead.",
  );
  expect(screen.getByLabelText("Email")).toHaveValue("exists@example.test");
  expect(fetcher.mock.calls).toHaveLength(1);
});
