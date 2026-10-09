/** Revisions, currency scales, editable failed saves and current permission gates in the native settings editor. */
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GuardrailSettings from "../../src/admin/intelligence/GuardrailSettings";
import type { Product } from "../../src/admin/shell/studio-types";
const access = vi.hoisted(() => ({ permissions: ["settings.write"] }));
vi.mock("../../src/admin/shell/StudioContext", () => ({
  useStudio: () => ({ access: access.permissions }),
}));
afterEach(() => {
  cleanup();
  access.permissions = ["settings.write"];
});
const product = {
  id: "yen",
  name: "Fixture",
  price: 1200,
  extra: { priceCurrency: "JPY" },
} as Product;
const data = {
  currencies: {
    pricingCurrency: "EUR",
    baseCurrency: "EUR",
    definitions: [{ code: "JPY", scale: 0 }],
  },
  aiPolicy: {
    corridors: [],
    autonomy: { enabled: false, maxChangeBps: 500, productsPerDay: 20 },
  },
};
describe("AI guardrails", () => {
  it("uses configured minor units, preserves unrelated settings and rejects stale saves visibly", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ...data, mainLocale: "de-DE" },
        revision: 7,
      })
      .mockRejectedValueOnce(new Error("Stale revision"));
    render(<GuardrailSettings request={request} products={[product]} />);
    const add = await screen.findByRole("button", {
      name: "Produktleitplanke hinzufügen",
    });
    fireEvent.click(add);
    expect(
      screen.getByLabelText("Mindestpreis (kleine Währungseinheiten)"),
    ).toHaveValue(1200);
    fireEvent.click(
      screen.getByRole("button", { name: "Leitplanken speichern" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Stale revision"),
    );
    expect(request.mock.calls[1][1]).toMatchObject({
      revision: 7,
      data: {
        mainLocale: "de-DE",
        aiPolicy: {
          corridors: [
            { currency: "JPY", minimumMinor: 1200, maximumMinor: 1200 },
          ],
        },
      },
    });
    expect(
      screen.getByLabelText("Mindestpreis (kleine Währungseinheiten)"),
    ).toBeEnabled();
  });
  it("does not offer editing without current settings permission", async () => {
    access.permissions = ["knowledge.read"];
    render(
      <GuardrailSettings
        request={vi.fn().mockResolvedValue({ data, revision: 1 })}
        products={[product]}
      />,
    );
    expect(
      await screen.findByRole("button", {
        name: "Produktleitplanke hinzufügen",
      }),
    ).toBeDisabled();
  });
});
