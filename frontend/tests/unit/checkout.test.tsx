/** Purchase review and provider confirmation use synthetic carts and mocked transport. */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, StrictMode } from "react";
import { describe, it, expect, vi } from "vitest";
import { cart as base } from "./fixtures";
import type { Cart, Order } from "../../src/shared/api/shop-api";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import CheckoutPanel from "../../src/storefront/checkout/CheckoutPanel";
import PaymentSession from "../../src/storefront/checkout/PaymentSession";
import { placeCheckoutOrder } from "../../src/storefront/checkout/checkout-order";
vi.mock("../../src/storefront/legal/PrivacyProvider", () => ({
  useLegalPolicy: () => ({
    policyVersion: "fixture",
    data: { strictCheckout: false },
  }),
}));
const api = vi.hoisted(() => vi.fn());
vi.mock("../../src/shared/api/shop-api", () => ({ shopApi: api }));
vi.mock("../../src/shared/geography/useCountryCatalogue", () => ({
  useCountryCatalogue: () => undefined,
}));
vi.mock("../../src/shared/apps/AppSurfaces", () => ({
  AppSurfaceSlot: () => null,
}));
const address = {
  name: "Fixture Buyer",
  firstName: "Fixture",
  lastName: "Buyer",
  street: "Test Street 1",
  postalCode: "12345",
  city: "Test",
  country: "DE",
};
function fixture(): Cart {
  return {
    ...structuredClone(base),
    checkout: {
      country: "DE",
      shippingMethodId: "standard",
      paymentMethodId: "card",
      customerEmail: "buyer@example.test",
      address,
      billingAddress: address,
    },
    lineItems: [
      {
        id: "lamp",
        label: "Fixture lamp",
        quantity: 1,
        minPurchase: 1,
        purchaseSteps: 1,
        price: { unitPrice: 50, totalPrice: 50 },
      },
    ],
    availableShippingMethods: [
      {
        id: "standard",
        name: "Standard",
        active: true,
        price: 5,
        freeAbove: null,
        minDays: 1,
        maxDays: 3,
        countries: ["DE"],
        taxType: "highest",
      },
    ],
    availablePaymentMethods: [
      {
        id: "card",
        name: "Card",
        active: true,
        businessOnly: false,
        mode: "simulated",
      },
    ],
    price: {
      positionPrice: 50,
      totalPrice: 55,
      netPrice: 46.22,
      tax: 8.78,
      taxStatus: "gross",
    },
    shippingCosts: { totalPrice: 5 },
  };
}
function harness(review = vi.fn(), buy = vi.fn()) {
  function View() {
    const [cart, setCart] = useState(fixture);
    return (
      <CheckoutPanel
        cart={cart}
        busy={false}
        onClose={vi.fn()}
        onQuantity={() =>
          setCart((old) => ({ ...old, revision: old.revision + 1 }))
        }
        onCart={setCart}
        onCoupons={async () => {}}
        onSelection={async (selection) => {
          review(selection);
          const next = {
            ...cart,
            revision: cart.revision + 1,
            checkout: selection,
            price: { ...cart.price, totalPrice: 59 },
          };
          setCart(next);
          return next;
        }}
        onBuy={buy}
      />
    );
  }
  render(
    <LocaleProvider>
      <View />
    </LocaleProvider>,
  );
  return { review, buy };
}
describe("One-page purchase", () => {
  it("reviews the authoritative new total before an explicit purchase", async () => {
    const { review, buy } = harness();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Review order" }));
    expect(review).toHaveBeenCalledOnce();
    expect(buy).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: /Order with obligation to pay.*59/ }),
    );
    expect(buy).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Save selection" }),
    ).not.toBeInTheDocument();
  });
  it("keeps an address draft when quantity refreshes invalidate review", async () => {
    harness();
    const user = userEvent.setup();
    const street = screen.getByRole("textbox", {
      name: "Street and house number",
    });
    await user.clear(street);
    await user.type(street, "New Street 8");
    await user.click(
      screen.getByRole("button", { name: "Quantity + Fixture lamp" }),
    );
    expect(street).toHaveValue("New Street 8");
    expect(
      screen.getByRole("button", { name: "Review order" }),
    ).toBeInTheDocument();
  });
  it("does not submit incomplete contact data", () => {
    const { review, buy } = harness();
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review order" }));
    expect(review).not.toHaveBeenCalled();
    expect(buy).not.toHaveBeenCalled();
  });
  it("binds purchase to tenant, channel, reviewed price and revision", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: "order-a" }) });
    vi.stubGlobal("fetch", fetch);
    await placeCheckoutOrder(fixture(), "de-DE", "tenant-a", "channel-a");
    expect(fetch.mock.calls[0][1].headers).toMatchObject({
      "x-tenant": "tenant-a",
      "sw-sales-channel-id": "channel-a",
      "x-commerce-cart-revision": "1",
      "x-commerce-total-minor": "5500",
      "Idempotency-Key": "browser-unit-cart",
    });
  });
  it("recovers a committed order after a lost reply without another purchase", async () => {
    const committed = { id: "committed-order" } as Order;
    const fetch = vi.fn().mockRejectedValue(new Error("Connection lost"));
    vi.stubGlobal("fetch", fetch);
    api.mockReset().mockResolvedValue({
      ...fixture(),
      status: "completed",
      order: committed,
    });
    await expect(
      placeCheckoutOrder(fixture(), "en-GB", "tenant-a", "default"),
    ).resolves.toEqual(committed);
    expect(fetch).toHaveBeenCalledOnce();
    expect(api).toHaveBeenCalledExactlyOnceWith(
      "/store-api/checkout/cart",
      undefined,
      fixture().token,
    );
  });
  it.each(["active", "foreign", "unavailable"])(
    "preserves the original failure for %s recovery without a purchase retry",
    async (mode) => {
      const failure = new Error("Connection lost");
      const fetch = vi.fn().mockRejectedValue(failure);
      vi.stubGlobal("fetch", fetch);
      api.mockReset();
      if (mode === "unavailable")
        api.mockRejectedValue(new Error("Read failed"));
      else
        api.mockResolvedValue({
          ...fixture(),
          status: mode === "active" ? "active" : "completed",
          id: mode === "foreign" ? "other-cart" : fixture().id,
          order: { id: "committed-order" },
        });
      await expect(
        placeCheckoutOrder(fixture(), "en-GB", "tenant-a", "default"),
      ).rejects.toBe(failure);
      expect(fetch).toHaveBeenCalledOnce();
      expect(api).toHaveBeenCalledOnce();
    },
  );
  it("surfaces a changed price without retrying the financial command", async () => {
    api.mockReset().mockResolvedValue(fixture());
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        errors: [{ detail: "Checkout changed; review your order again" }],
      }),
    });
    vi.stubGlobal("fetch", fetch);
    await expect(
      placeCheckoutOrder(fixture(), "en-GB", "tenant-a", "default"),
    ).rejects.toThrow(/Review your order again/);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
describe("Provider confirmation", () => {
  it("reconciles once, displays the real environment and stops when captured", async () => {
    vi.useFakeTimers();
    history.replaceState(
      null,
      "",
      "/?shop=unit-shop&paymentReturn=approved#payment/attempt-a",
    );
    let reads = 0;
    api.mockReset().mockImplementation((_path: string, body?: unknown) =>
      Promise.resolve(
        body
          ? { jobId: "job-a" }
          : {
              state: ++reads === 1 ? "approved" : "captured",
              amountMinor: 5500,
              currency: "EUR",
              environment: "live",
            },
      ),
    );
    await act(async () => {
      render(
        <LocaleProvider>
          <StrictMode>
            <PaymentSession id="attempt-a" token="context-a" />
          </StrictMode>
        </LocaleProvider>,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText("Payment confirmed")).toBeInTheDocument();
    expect(screen.getByText("PayPal payment")).toBeInTheDocument();
    expect(api.mock.calls.filter(([, body]) => body)).toHaveLength(1);
    const count = api.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(api).toHaveBeenCalledTimes(count);
    expect(
      screen.queryByRole("button", { name: "Capture" }),
    ).not.toBeInTheDocument();
  });
  it("does not reuse another attempt's return command or payment confirmation", async () => {
    history.replaceState(
      null,
      "",
      "/?paymentReturn=approved#payment/attempt-a",
    );
    api.mockReset().mockImplementation((path: string, body?: unknown) =>
      Promise.resolve(
        body
          ? { jobId: "fixture" }
          : {
              state: path.includes("attempt-a") ? "captured" : "cancelled",
              environment: "sandbox",
              amountMinor: 5500,
              currency: "EUR",
            },
      ),
    );
    const { rerender } = render(
      <LocaleProvider>
        <PaymentSession id="attempt-a" token="context-a" />
      </LocaleProvider>,
    );
    await screen.findByText("Payment confirmed");
    rerender(
      <LocaleProvider>
        <PaymentSession id="attempt-b" token="context-b" />
      </LocaleProvider>,
    );
    await screen.findByText("Payment cancelled");
    expect(screen.queryByText("Payment confirmed")).not.toBeInTheDocument();
    expect(
      api.mock.calls.filter(
        ([path, body]) => path.includes("attempt-b") && body,
      ),
    ).toHaveLength(1);
  });
  it("offers recovery on uncertainty without claiming payment", async () => {
    api.mockReset().mockResolvedValue({
      state: "ready",
      environment: "sandbox",
      amountMinor: 5500,
      currency: "EUR",
      job: { state: "uncertain", operation: "capture" },
    });
    render(
      <LocaleProvider>
        <PaymentSession id="attempt-b" token="context-b" />
      </LocaleProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Check payment again" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Test payment · no real money"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Payment confirmed")).not.toBeInTheDocument();
  });
});
