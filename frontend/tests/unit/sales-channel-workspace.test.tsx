/** Sales-channel onboarding exercises the real editors and native channel payload rather than a second schema. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import SalesChannelsWorkspace from "../../src/admin/channels/SalesChannelsWorkspace";
import ChannelEditor from "../../src/admin/channels/ChannelEditor";
import {
  freshChannel,
  channelUrl,
} from "../../src/admin/channels/channel-model";
it("creates a channel with translated name, searchable product assignment and real shop languages", async () => {
  const user = userEvent.setup(),
    request = vi.fn(async (path: string, body?: any) => {
      if (body) return { revision: 1 };
      if (path === "/api/automation") return { channels: [] };
      if (path === "/api/auth/access")
        return { permissions: ["settings.write"] };
      if (path === "/api/merchant/commerce")
        return { data: { mainLocale: "es-ES", locales: ["es-ES", "de-DE"] } };
      if (path === "/api/merchant/categories") return { elements: [] };
      if (path.startsWith("/api/merchant/products?"))
        return {
          elements: [{ id: "prod", name: "Chair", productNumber: "SKU" }],
        };
      return { elements: [] };
    });
  render(
    <LocaleProvider>
      <SalesChannelsWorkspace
        request={request}
        workspace="shop"
        onTeam={vi.fn()}
      />
    </LocaleProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /Create sales channel/ }),
    ).toBeEnabled(),
  );
  await user.click(
    screen.getByRole("button", { name: /Create sales channel/ }),
  );
  await user.type(screen.getByLabelText("Channel name"), "Mi tienda");
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.queryByRole("button", { name: "French" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Selected products" }));
  await user.click(
    await screen.findByRole("button", { name: /Chair.*Add product/ }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("button", { name: "Create sales channel" }),
  );
  await screen.findByText("Channel saved");
  const call = request.mock.calls.find((c) => c[1]);
  expect(call?.[0]).toMatch(/^\/api\/automation\/channels\/shop_/);
  expect(call?.[1]).toMatchObject({
    revision: 0,
    data: {
      name: { "es-ES": "Mi tienda" },
      locales: ["es-ES"],
      productIds: ["prod"],
      kind: "storefront",
    },
  });
});
it("guards unsaved channel navigation and requires confirmation before deactivation", async () => {
  const user = userEvent.setup(),
    back = vi.fn(),
    save = vi.fn();
  const channel = { ...freshChannel("en-GB"), revision: 2 };
  channel.data.name = { en: "Fashion" };
  const request = vi.fn(async (path: string) =>
    path.includes("history") ? { elements: [] } : { revision: 3 },
  );
  render(
    <LocaleProvider>
      <ChannelEditor
        initial={channel}
        request={request}
        languages={["en-GB", "es-ES"]}
        mainLocale="en-GB"
        categories={[]}
        workspace="tenant"
        canWrite
        onBack={back}
        onSaved={save}
      />
    </LocaleProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Deactivate channel" }));
  expect(
    request.mock.calls.some((c) => c[0].startsWith("/api/automation")),
  ).toBe(false);
  await user.click(
    screen.getAllByRole("button", { name: "Deactivate channel" }).at(-1)!,
  );
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: 3,
        data: expect.objectContaining({ active: false }),
      }),
    ),
  );
  await user.type(screen.getByLabelText("Channel name"), " altered");
  await user.click(screen.getByRole("button", { name: /Back/ }));
  expect(await screen.findByRole("dialog")).toHaveTextContent(
    "Discard unsaved changes?",
  );
  expect(back).not.toHaveBeenCalled();
  expect(channelUrl("shop?a", "channel#b")).toBe(
    "/?shop=shop%3Fa&channel=channel%23b#",
  );
});
it("opens existing inherited channel settings at the selected scope", async () => {
  const user = userEvent.setup(),
    channel = { ...freshChannel("en-GB"), id: "fashion", revision: 1 };
  channel.data.name = { en: "Fashion" };
  const request = vi.fn(async (path: string) => {
    if (path.startsWith("/api/settings/master-data/channels/"))
      return {
        revision: 0,
        baseRevision: 1,
        data: {},
        inherited: { name: "Base company" },
      };
    if (path === "/store-api/countries")
      return { countries: [], mainLocale: "en-GB", locales: ["en-GB"] };
    if (path === "/api/automation") return { channels: [channel] };
    return { elements: [] };
  });
  render(
    <LocaleProvider>
      <ChannelEditor
        initial={channel}
        request={request}
        languages={["en-GB"]}
        mainLocale="en-GB"
        categories={[]}
        workspace="tenant"
        canWrite
        onBack={vi.fn()}
        onSaved={vi.fn()}
      />
    </LocaleProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Inherited settings" }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/settings/master-data/channels/fashion",
    ),
  );
});
