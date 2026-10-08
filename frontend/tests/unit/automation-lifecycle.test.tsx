/** Real editors exercise selection, granular access, dependency confirmation and stale deletion failure. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import AutomationDelete from "../../src/admin/automation/AutomationDelete";
import AutomationView from "../../src/admin/automation/AutomationView";
import SalesChannelsWorkspace from "../../src/admin/channels/SalesChannelsWorkspace";
import { localDate } from "../../src/admin/automation/PromotionSchedule";
const rule = {
  id: "eligible",
  revision: 2,
  data: {
    name: { "en-GB": "Eligible carts" },
    active: true,
    condition: { type: "alwaysValid" },
  },
};
const channel = {
  id: "default",
  revision: 1,
  data: {
    name: { "en-GB": "Main shop" },
    kind: "storefront",
    active: true,
    locales: ["en-GB"],
    productIds: [],
  },
};
it("opens the persisted main channel for editing and pausing while protecting deletion", async () => {
  const user = userEvent.setup();
  const request = vi.fn(async (path: string) =>
    path === "/api/automation"
      ? { channels: [channel] }
      : path === "/api/merchant/commerce"
        ? { data: { mainLocale: "en-GB", locales: ["en-GB"] } }
        : path === "/api/auth/access"
          ? { permissions: ["settings.write"] }
          : { elements: [] },
  );
  render(
    <LocaleProvider>
      <SalesChannelsWorkspace
        request={request}
        workspace="shop"
        onTeam={vi.fn()}
      />
    </LocaleProvider>,
  );
  await screen.findByRole("heading", { name: "Main shop" });
  await user.click(screen.getByRole("button", { name: /Manage channel/ }));
  expect(screen.getByLabelText("Channel name")).toHaveValue("Main shop");
  expect(
    screen.getByRole("button", { name: "Deactivate channel" }),
  ).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "Delete" }),
  ).not.toBeInTheDocument();
});
it("opens existing rules immediately and honors granular settings.write for custom roles", async () => {
  const user = userEvent.setup();
  const request = vi.fn(async (path: string) =>
    path === "/api/automation"
      ? {
          rules: [rule],
          flows: [],
          channels: [channel],
          promotions: [],
          jobs: [],
        }
      : path === "/api/auth/access"
        ? { permissions: ["settings.write"] }
        : path === "/api/merchant/commerce"
          ? { data: { mainLocale: "en-GB", locales: ["en-GB"] } }
          : path === "/api/automation/catalog"
            ? {
                conditions: ["alwaysValid"],
                events: ["order.placed"],
                fields: [],
                apps: [],
              }
            : { elements: [] },
  );
  render(
    <LocaleProvider>
      <AutomationView request={request} role="custom" />
    </LocaleProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Title")).toHaveValue("Eligible carts"),
  );
  expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  await user.type(screen.getByLabelText("Search definitions"), "nothing");
  expect(
    screen.queryByRole("button", { name: /Eligible carts/ }),
  ).not.toBeInTheDocument();
});
it("checks references before confirmation and never submits a blocked deletion", async () => {
  const user = userEvent.setup(),
    deleted = vi.fn();
  const request = vi.fn(async () => ({
    dependencies: [
      {
        kind: "flows",
        id: "fulfill",
        count: 1,
        name: { "en-GB": "Fulfillment" },
      },
    ],
    blocked: true,
  }));
  render(
    <LocaleProvider>
      <AutomationDelete
        request={request}
        kind="rules"
        id="eligible"
        revision={2}
        disabled={false}
        onDeleted={deleted}
      />
    </LocaleProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Delete" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("Still in use");
  expect(
    screen.getAllByRole("button", { name: "Delete" }).at(-1),
  ).toBeDisabled();
  expect(deleted).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(1);
});
it("requires explicit confirmation, sends the revision once and keeps failures visible", async () => {
  const user = userEvent.setup(),
    deleted = vi.fn();
  const request = vi.fn(async (_p: string, body?: unknown) => {
    if (body) throw new Error("Configuration revision changed");
    return { dependencies: [], blocked: false };
  });
  render(
    <LocaleProvider>
      <AutomationDelete
        request={request}
        kind="flows"
        id="fulfill"
        revision={4}
        disabled={false}
        onDeleted={deleted}
      />
    </LocaleProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Delete" }));
  expect(request).toHaveBeenCalledTimes(1);
  await user.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Configuration revision changed",
  );
  expect(request).toHaveBeenCalledWith(
    "/api/automation/flows/fulfill",
    { revision: 4 },
    "DELETE",
  );
  expect(deleted).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
it("removes only after a successful response", async () => {
  const user = userEvent.setup(),
    deleted = vi.fn(),
    request = vi.fn(async (_p: string, body?: unknown) =>
      body ? { deleted: true } : { dependencies: [] },
    );
  render(
    <LocaleProvider>
      <AutomationDelete
        request={request}
        kind="promotions"
        id="coupon"
        revision={1}
        disabled={false}
        onDeleted={deleted}
      />
    </LocaleProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await user.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);
  await waitFor(() => expect(deleted).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(localDate(null)).toBe("");
  expect(localDate("bad")).toBe("");
  expect(localDate("2026-10-06T10:30:00Z")).toMatch(/^2026-10-06T\d{2}:30$/);
});
