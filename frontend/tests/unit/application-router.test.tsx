/** Entry routing, lazy workspace selection, callbacks and hash-listener cleanup. */
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import ApplicationRouter from "../../src/application/ApplicationRouter";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
vi.mock("../../src/admin/shell/Merchant", () => ({
  default: ({ onExit }: { onExit: () => void }) => (
    <section>
      Studio fixture<button onClick={onExit}>Store</button>
    </section>
  ),
}));
vi.mock("../../src/storefront/shell/Storefront", () => ({
  default: ({ onMerchant }: { onMerchant: () => void }) => (
    <section>
      Store fixture<button onClick={onMerchant}>Studio</button>
    </section>
  ),
}));
vi.mock("../../src/platform/PlatformConsole", () => ({
  default: () => <section>Platform fixture</section>,
}));
it("uses store/studio callbacks and selects the operator root through navigation", async () => {
  history.replaceState({}, "", "/?shop=unit-shop#");
  const view = render(<ApplicationRouter />, { wrapper: LocaleProvider });
  await screen.findByText("Store fixture");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Studio" }));
  await screen.findByText("Studio fixture");
  expect(location.hash).toBe("#merchant");
  await user.click(screen.getByRole("button", { name: "Store" }));
  await screen.findByText("Store fixture");
  expect(location.hash).toBe("");
  act(() => {
    history.replaceState({}, "", "/#platform");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await screen.findByText("Platform fixture");
  const remove = vi.spyOn(window, "removeEventListener");
  view.unmount();
  expect(remove).toHaveBeenCalledWith("hashchange", expect.any(Function));
});
it.each(["#merchant", "#studio-content"])(
  "opens Studio directly for %s",
  async (hash) => {
    history.replaceState({}, "", `/${hash}`);
    render(<ApplicationRouter />, { wrapper: LocaleProvider });
    await screen.findByText("Studio fixture");
    expect(screen.queryByText("Store fixture")).not.toBeInTheDocument();
  },
);
