/** Native preference UI keeps consent and AI sharing separate and preserves current graph revisions. */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShoppingPreferences from "../../src/storefront/account/ShoppingPreferences";
const state = vi.hoisted(() => ({
  allowed: true,
  request: vi.fn(),
  open: vi.fn(),
}));
vi.mock("../../src/shared/api/shop-api", () => ({ shopApi: state.request }));
vi.mock("../../src/shared/legal/consent-store", () => ({
  usePurpose: () => state.allowed,
  openConsent: state.open,
}));
afterEach(() => {
  cleanup();
  state.allowed = true;
  state.request.mockReset();
  state.open.mockReset();
});
describe("Private shopping preferences", () => {
  it("requires consent to read or save, but permits erasure after withdrawal", async () => {
    state.allowed = false;
    state.request.mockResolvedValue({ forgotten: true });
    render(<ShoppingPreferences token="cart-only" />);
    expect(state.request).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Präferenzen speichern" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Datenschutzauswahl" }));
    expect(state.open).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("button", { name: "Dieses Gedächtnis löschen" }),
    );
    await screen.findByText("Gedächtnis gelöscht.");
    expect(state.request).toHaveBeenCalledWith(
      "/store-api/intelligence/preferences",
      undefined,
      "cart-only",
      "DELETE",
    );
  });
  it("keeps sharing off by default, retains other graph data and reports stale revisions", async () => {
    const graph = {
      nodes: [
        {
          id: "owned",
          kind: "owned_product",
          value: "Lamp",
          productId: "lamp",
        },
      ],
      edges: [],
    };
    state.request
      .mockResolvedValueOnce({ graph, revision: 4 })
      .mockRejectedValueOnce(new Error("Stale revision"));
    render(<ShoppingPreferences token="native-context" />);
    await waitFor(() => expect(state.request).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    fireEvent.change(screen.getByLabelText("Bevorzugte Größe"), {
      target: { value: "M" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Präferenzen speichern" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Stale revision",
    );
    expect(state.request.mock.calls[1]).toEqual([
      "/store-api/intelligence/preferences",
      expect.objectContaining({
        revision: 4,
        useForAdvice: false,
        graph: {
          nodes: [
            graph.nodes[0],
            expect.objectContaining({ kind: "size", value: "M" }),
          ],
          edges: [],
        },
      }),
      "native-context",
      "PUT",
    ]);
    expect(screen.getByLabelText("Bevorzugte Größe")).toHaveValue("M");
  });
});
