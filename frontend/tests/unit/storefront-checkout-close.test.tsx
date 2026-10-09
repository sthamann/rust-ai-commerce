/** Actual storefront/panel composition returns embedded close and native cancel to Storyfront. */
import type { PropsWithChildren } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import Storefront from "../../src/storefront/shell/Storefront";
import { cart } from "./fixtures";

const state = vi.hoisted(() => ({ setBag: vi.fn() }));
vi.mock("../../src/storefront/shell/useStorefrontController", () => ({
  useStorefrontController: () => ({
    ...state,
    company: {},
    cart: { ...cart, lineItems: [] },
    shopTenant: "unit-shop",
    salesChannel: "default",
    products: [],
    bag: true,
    appPath: "#checkout/cart",
    w: (key: string) => key,
    s: (key: string) => key,
  }),
}));
vi.mock("../../src/storefront/legal/PrivacyProvider", () => ({
  default: ({ children }: PropsWithChildren) => children,
}));
vi.mock("../../src/shared/apps/AppSurfaces", () => ({
  AppSurfaceProvider: ({ children }: PropsWithChildren) => children,
  AppSurfaceSlot: () => null,
}));
vi.mock("../../src/storefront/analytics/ShopAnalytics", () => ({
  default: () => null,
}));
vi.mock("../../src/storefront/shell/StorefrontHeader", () => ({
  default: () => null,
}));
vi.mock("../../src/storefront/shell/StorefrontHome", () => ({
  default: () => null,
}));
const originalParent = window.parent;
afterEach(() => {
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: originalParent,
  });
  state.setBag.mockClear();
});
it.each(["close button", "native Escape cancellation"])(
  "returns the embedded %s to its exact parent without purchase or clearing a cart",
  async (action) => {
    const postMessage = vi.fn();
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage },
    });
    history.replaceState(
      null,
      "",
      "/checkout?embed=1&parentOrigin=https%3A%2F%2Fown.vendune.ai",
    );
    render(<Storefront onMerchant={vi.fn()} />, { wrapper: LocaleProvider });
    if (action === "close button")
      await userEvent.click(screen.getByRole("button", { name: "Close" }));
    else fireEvent(screen.getByRole("dialog"), new Event("cancel"));
    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: "vendune.checkout.close" },
      "https://own.vendune.ai",
    );
    expect(state.setBag).toHaveBeenCalledExactlyOnceWith(false);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("closes ordinary checkout locally without a parent message", async () => {
  history.replaceState(null, "", "/checkout");
  render(<Storefront onMerchant={vi.fn()} />, { wrapper: LocaleProvider });
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(state.setBag).toHaveBeenCalledExactlyOnceWith(false);
  expect(fetch).not.toHaveBeenCalled();
});
