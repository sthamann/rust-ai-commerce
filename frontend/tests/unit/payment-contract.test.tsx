/** Payment definitions and scoped browser sessions cannot silently grant monetary authority. */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import AppPayments from "../../src/admin/developer/AppPayments";
import EmbeddedPayment from "../../src/storefront/checkout/EmbeddedPayment";
import { assistedManifest } from "../../src/admin/developer/assistant-model";
import { compile, problems } from "../../src/admin/developer/app-model";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
const api = vi.hoisted(() => vi.fn());
vi.mock("../../src/shared/api/shop-api", () => ({ shopApi: api }));
it("retains provider methods and private onboarding on visual or agent edits", () => {
  const m = assistedManifest({
    kind: "payment",
    location: "admin.navigation",
    id: "provider_app",
    name: { en: "Provider", de: "Anbieter", es: "Proveedor" },
    mcp: true,
    publicRead: false,
    event: "order.placed",
    cron: "0 * * * * *",
  });
  expect(m.paymentProvider?.methods[0]).toMatchObject({
    intent: "capture",
    checkout: "redirect",
    currencies: ["EUR"],
  });
  expect(
    m.actions?.find((a) => a.handler === "payment_onboarding"),
  ).toMatchObject({ permission: "payments.manage", public: false, mcp: true });
  expect(compile(JSON.parse(JSON.stringify(m)))).toEqual(m);
  expect(problems(m)).toBe(false);
  const bad = structuredClone(m);
  bad.runtime = "declarative";
  expect(problems(bad)).toBe(true);
});
it("sends a scoped token only to the fixed provider origin and rejects forged frame messages", async () => {
  api.mockResolvedValue({
    uiUrl: "https://provider.example.test/frame",
    sessionToken: "scoped-private-browser-token",
    nonce: "fixed-session-nonce",
    expiresIn: 300,
  });
  const changed = vi.fn();
  render(
    <EmbeddedPayment
      id="attempt"
      token="customer-cart-token"
      onChanged={changed}
    />,
    { wrapper: LocaleProvider },
  );
  const frame = await waitFor(() => {
    const f = document.querySelector("iframe");
    expect(f).toBeTruthy();
    return f!;
  });
  expect(api).toHaveBeenCalledWith(
    `/store-api/payments/attempt/session?parentOrigin=${encodeURIComponent(window.location.origin)}`,
    undefined,
    "customer-cart-token",
  );
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  fireEvent.load(frame);
  expect(post).toHaveBeenCalledWith(
    {
      type: "vendune.payment.init",
      sessionToken: "scoped-private-browser-token",
      nonce: "fixed-session-nonce",
    },
    "https://provider.example.test",
  );
  const event = {
    source: frame.contentWindow,
    origin: "https://provider.example.test",
    data: { type: "vendune.payment.changed", nonce: "fixed-session-nonce" },
  };
  window.dispatchEvent(
    new MessageEvent("message", {
      ...event,
      origin: "https://foreign.example.test",
    }),
  );
  window.dispatchEvent(
    new MessageEvent("message", {
      ...event,
      data: { ...event.data, nonce: "forged" },
    }),
  );
  expect(changed).not.toHaveBeenCalled();
  window.dispatchEvent(new MessageEvent("message", event));
  expect(changed).toHaveBeenCalledTimes(1);
});

it("requires confirmation to disconnect the selected channel and keeps the full provider draft", async () => {
  const request = vi.fn(async (path: string, body?: any) => {
    if (path === "/store-api/countries") return { countries: [] };
    if (path === "/api/automation") return { channels: [{ id: "web_de" }] };
    return { ready: body.operation !== "disconnect" };
  });
  const m = assistedManifest({
    kind: "payment",
    location: "admin.navigation",
    id: "provider_app",
    name: { en: "Provider", de: "Anbieter", es: "Proveedor" },
    mcp: true,
    publicRead: false,
    event: "order.placed",
    cron: "0 * * * * *",
  });
  const change = vi.fn();
  render(<AppPayments manifest={m} onChange={change} request={request} />, {
    wrapper: LocaleProvider,
  });
  await waitFor(() =>
    expect(screen.getByRole("option", { name: "web_de" })).toBeTruthy(),
  );
  fireEvent.change(screen.getByLabelText("Sales channel"), {
    target: { value: "web_de" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Disconnect account" }),
    ).toBeTruthy(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Disconnect account" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(
    request.mock.calls.filter(([, b]) => b?.operation === "disconnect"),
  ).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Disconnect account" }));
  fireEvent.click(
    screen.getAllByRole("button", { name: "Disconnect account" }).at(-1)!,
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/payment-providers/provider_app/onboarding",
      expect.objectContaining({
        operation: "disconnect",
        channel: "web_de",
        environment: "sandbox",
        approve: true,
      }),
    ),
  );
  expect(change).not.toHaveBeenCalled();
});
