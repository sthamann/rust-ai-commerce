/** Write-only keys, revision-guarded saves and explicit reversible trash confirmation. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import PlatformAI from "../../src/platform/PlatformAI";
import PlatformShopDetail from "../../src/platform/PlatformShopDetail";
import AdminHub from "../../src/platform/AdminHub";
const settings = {
  revision: 3,
  settings: {
    defaultProvider: "openai",
    providers: {
      ollama: {
        endpoint: "https://ollama.example.test",
        model: "fixture",
        enabled: true,
      },
      openai: {
        endpoint: "https://api.openai.com/v1",
        model: "fixture",
        enabled: true,
      },
      anthropic: {
        endpoint: "https://api.anthropic.com/v1",
        model: "fixture",
        enabled: true,
      },
    },
  },
  keyStored: { openai: true },
  encryptedStorageReady: true,
  effective: {
    defaultProvider: "openai",
    providers: [{ id: "openai", model: "fixture", configured: true }],
  },
};
function transport(value: unknown) {
  const fetcher = vi.fn(
    async (_url: unknown, _init?: RequestInit) =>
      new Response(JSON.stringify(value), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
it("saves inherited defaults and keys without exposing existing keys or retaining new keys in inputs", async () => {
  const f = transport(settings),
    u = userEvent.setup();
  render(<PlatformAI token="fixture-session" />, { wrapper: LocaleProvider });
  await screen.findByText("Encrypted key stored");
  expect(
    screen
      .getAllByLabelText("New API key")
      .every((e) => (e as HTMLInputElement).value === ""),
  ).toBe(true);
  await u.type(screen.getAllByLabelText("New API key")[1], "synthetic-key");
  await u.click(screen.getByRole("button", { name: "Save configuration" }));
  await screen.findByText("Configuration saved");
  const call = f.mock.calls.at(-1)!;
  expect(call[1]?.method).toBe("PUT");
  const body = JSON.parse(call[1]?.body as string);
  expect(body.revision).toBe(3);
  expect(body.keys.openai).toBe("synthetic-key");
  expect(
    (screen.getAllByLabelText("New API key")[1] as HTMLInputElement).value,
  ).toBe("");
});
it("requires shop ID and reason before moving a shop to trash", async () => {
  const f = transport({}),
    changed = vi.fn(),
    u = userEvent.setup();
  render(
    <PlatformShopDetail
      token="fixture-session"
      onChanged={changed}
      data={{
        id: "own-shop",
        name: "Own shop",
        status: "active",
        statusRevision: 4,
        createdAt: "2026-10-06T12:00:00Z",
        urls: {
          storefrontUrl: "https://own-shop.vendune.ai/",
          studioUrl: "https://app.vendune.ai/?shop=own-shop#merchant",
        },
        counts: { products: 2, customers: 0, apps: 1 },
        members: [],
        salesChannels: [],
        business: {},
        traffic: [],
        days: 7,
        amounts: [],
        timeline: [],
      }}
    />,
    { wrapper: LocaleProvider },
  );
  await u.click(screen.getByRole("button", { name: "Move to trash" }));
  expect(
    screen.getByRole("button", { name: "Save configuration" }),
  ).toBeDisabled();
  await u.type(screen.getByLabelText("Reason"), "Synthetic test");
  await u.type(screen.getByLabelText("Confirm shop ID"), "own-shop");
  await u.click(screen.getByRole("button", { name: "Save configuration" }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(JSON.parse(f.mock.calls[0][1]?.body as string)).toEqual({
    status: "archived",
    revision: 4,
    reason: "Synthetic test",
    confirmShopId: "own-shop",
  });
});
it("offers independent merchant and operator entry points", () => {
  render(<AdminHub />, { wrapper: LocaleProvider });
  expect(screen.getByRole("link", { name: /Merchant studio/ })).toHaveAttribute(
    "href",
    "/#login",
  );
  expect(
    screen.getByRole("link", { name: /Platform operations/ }),
  ).toHaveAttribute("href", "#platform");
});
