/** Currency UI controls and reviewed checkout use authoritative contexts and exact precision. */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  CurrencyContext,
  LocaleProvider,
  useLocale,
} from "../../src/shared/i18n/i18n";
import StorefrontCurrency from "../../src/storefront/shell/StorefrontCurrency";
import ProductCurrencyPrices from "../../src/admin/catalog/ProductCurrencyPrices";
import { placeCheckoutOrder } from "../../src/storefront/checkout/checkout-order";
import { cart as fixture } from "./fixtures";
import { convertDraftPrice } from "../../src/shared/money/fx-draft";
import OrderPaymentDelivery from "../../src/admin/orders/OrderPaymentDelivery";
import { newDraft } from "../../src/admin/catalog/catalog-model";
const shared = vi.hoisted(() => ({
  api: vi.fn(),
  controller: undefined as any,
}));
vi.mock("../../src/shared/api/shop-api", () => ({ shopApi: shared.api }));
vi.mock("../../src/storefront/shell/StorefrontContext", () => ({
  useStorefront: () => shared.controller,
}));
const currencies = [
  { code: "EUR", scale: 2, rate: "1", strategy: "automatic" },
  { code: "USD", scale: 2, rate: "1.25", strategy: "fixed" },
  { code: "JPY", scale: 0, rate: "160", strategy: "automatic" },
];
function Format() {
  const { money } = useLocale();
  return <output>{money(12.34)}</output>;
}
describe("currency contexts", () => {
  it("changes only formatting context while the server remains the price authority", () => {
    localStorage.setItem("rac-locale", "en-GB");
    const view = render(
      <LocaleProvider>
        <CurrencyContext.Provider value="USD">
          <Format />
        </CurrencyContext.Provider>
      </LocaleProvider>,
    );
    expect(screen.getByText("US$12.34")).toBeInTheDocument();
    view.rerender(
      <LocaleProvider>
        <CurrencyContext.Provider value="JPY">
          <Format />
        </CurrencyContext.Provider>
      </LocaleProvider>,
    );
    expect(screen.getByText("JP¥12")).toBeInTheDocument();
  });
  it("selects a currency using the owning cart token and reviewed revision", async () => {
    shared.api.mockResolvedValue({
      ...fixture,
      price: { ...fixture.price, currency: "USD" },
    });
    const save = vi.fn();
    shared.controller = {
      cart: {
        ...fixture,
        availableCurrencies: ["EUR", "USD"],
        price: { ...fixture.price, currency: "EUR" },
      },
      busy: false,
      run: (fn: () => Promise<void>) => fn(),
      save,
    };
    render(
      <LocaleProvider>
        <StorefrontCurrency />
      </LocaleProvider>,
    );
    fireEvent.change(screen.getByLabelText("Currency"), {
      target: { value: "USD" },
    });
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(shared.api).toHaveBeenCalledWith(
      "/store-api/checkout/currency",
      { currency: "USD", revision: fixture.revision },
      fixture.token,
      "PUT",
    );
  });
  it("edits fixed prices as exact decimal strings and removes them explicitly", async () => {
    const request = vi.fn().mockResolvedValue({
      configuredCurrencies: currencies,
      availableCurrencies: currencies,
      defaultCurrency: "EUR",
    });
    const onChange = vi.fn();
    render(
      <LocaleProvider>
        <ProductCurrencyPrices
          draft={newDraft()}
          request={request}
          onChange={onChange}
        />
      </LocaleProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(6));
    fireEvent.change(screen.getByLabelText("Gross price"), {
      target: { value: "7.123" },
    });
    expect(onChange.mock.lastCall?.[0].extra.currencyPrices.USD.price).toBe(
      "7.123",
    );
  });
  it("uses rational half-up rounding for source-currency edits", () => {
    expect(
      convertDraftPrice(2.14, currencies[0] as any, currencies[1] as any),
    ).toBe(2.68);
    expect(
      convertDraftPrice(9.9, currencies[0] as any, currencies[2] as any),
    ).toBe(1584);
  });
  it("accepts a major-unit KWD refund and queues its exact three-digit minor amount", async () => {
    const onPayment = vi.fn().mockResolvedValue(true);
    render(
      <LocaleProvider>
        <OrderPaymentDelivery
          order={{
            cart: { price: { currency: "KWD", currencyScale: 3 } },
            payment: {
              state: "captured",
              attemptId: "fixture",
              provider: "example",
            },
            deliveries: [],
          }}
          busy={false}
          rights={["payments.manage"]}
          onAction={vi.fn()}
          onPayment={onPayment}
          pendingJob={false}
          onCheck={vi.fn()}
        />
      </LocaleProvider>,
    );
    fireEvent.change(screen.getByLabelText("Refund amount · KWD"), {
      target: { value: "7.123" },
    });
    fireEvent.submit(
      screen.getByLabelText("Refund amount · KWD").closest("form")!,
    );
    await waitFor(() => expect(onPayment).toHaveBeenCalledWith("refund", 7123));
  });
  it.each([
    ["JPY", 0, 1584, 1584],
    ["KWD", 3, 7.123, 7123],
    ["USD", 2, 12.38, 1238],
  ])(
    "reviews %s using its own minor-unit scale",
    async (code, scale, total, minor) => {
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "synthetic" }),
      });
      vi.stubGlobal("fetch", fetcher);
      await placeCheckoutOrder(
        {
          ...fixture,
          price: {
            ...fixture.price,
            currency: code as string,
            currencyScale: scale as number,
            totalPrice: total as number,
          },
        },
        "en-GB",
        "fixture",
        "default",
      );
      expect(fetcher.mock.lastCall?.[1].headers["x-commerce-total-minor"]).toBe(
        String(minor),
      );
      expect(fetcher.mock.lastCall?.[1].headers["x-commerce-currency"]).toBe(
        code,
      );
      vi.unstubAllGlobals();
    },
  );
});
