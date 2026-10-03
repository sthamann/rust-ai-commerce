/** Actual Studio composition navigates lazy workspaces with explicit synthetic HTTP contracts. */
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import Merchant from "../../src/admin/shell/Merchant";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { overview, providers, session } from "./fixtures";
const rights = [
  "customers.read",
  "customers.write",
  "orders.read",
  "orders.write",
  "catalog.write",
  "settings.write",
  "apps.manage",
  "users.manage",
  "automation.write",
];
function api(path: string) {
  const pathname = path.split("?")[0];
  const replies: Record<string, unknown> = {
    "/health": {},
    "/api/auth/access": { permissions: rights, available: rights },
    "/api/environments": { environments: [], releases: [] },
    "/api/agent/providers": providers,
    "/api/merchant/overview": overview,
    "/api/agent/conversations": { conversations: [] },
    "/api/auth/session": session,
    "/api/apps/surfaces": { surfaces: [] },
    "/api/merchant/orders": { elements: [], nextCursor: null },
    "/api/merchant/customers": { elements: [], nextCursor: null },
    "/api/search/product": { elements: [] },
    "/store-api/checkout/options": {
      countries: ["DE"],
      payments: [],
      shipping: [],
    },
    "/api/intelligence": { pairs: [], hypotheses: [] },
    "/api/knowledge/sources": { elements: [], nextCursor: null },
    "/api/apps": { packages: [] },
    "/api/developer": { builds: [], providers },
    "/api/workspace/members": { members: [], invitations: [] },
    "/api/settings/master-data": {
      revision: 1,
      data: {
        name: "Unit shop",
        address: "Synthetic street",
        taxId: "FIXTURE",
      },
    },
    "/api/merchant/commerce": {
      revision: 1,
      data: { countries: ["DE"], taxes: [], shipping: [], payments: [] },
    },
    "/api/automation/catalog": {
      conditions: ["alwaysValid", "cartCartAmount"],
      fields: [],
      events: ["order.placed"],
      apps: [],
    },
    "/api/automation": {
      rules: [],
      promotions: [],
      flows: [],
      channels: [],
      jobs: [],
    },
    "/api/auth/permission-catalog": { permissions: [] },
    "/api/auth/roles": { roles: [] },
    "/api/auth/keys": { keys: [] },
    "/api/auth/sessions": { sessions: [] },
    "/api/knowledge/documents": { elements: [], nextCursor: null },
  };
  if (!(pathname in replies))
    throw new Error(`Unspecified Studio fixture: ${path}`);
  return replies[pathname];
}
it("navigates every merchant workspace without duplicating registry requests", async () => {
  sessionStorage.setItem("rac-user-token", "unit-token");
  sessionStorage.setItem("rac-user-workspace", "unit-shop");
  const fetcher = vi.fn(async (path: string) => ({
    ok: true,
    status: 200,
    json: async () => api(path),
  }));
  vi.stubGlobal("fetch", fetcher);
  render(<Merchant onChanged={async () => {}} onExit={() => {}} />, {
    wrapper: LocaleProvider,
  });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([path]) => path === "/api/merchant/overview"),
    ).toBe(true),
  );
  const navigation = screen.getByRole("navigation", {
    name: "Commerce Studio",
  });
  const user = userEvent.setup();
  const buttons = within(navigation).getAllByRole("button");
  expect(buttons.length).toBe(14);
  for (const button of buttons) {
    await user.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-current", "page"));
    await waitFor(() =>
      expect(
        document.querySelector('.studio-content > [role="status"]'),
      ).toBeNull(),
    );
    expect(screen.getByRole("main").textContent?.trim()).not.toBe("");
  }
  expect(
    fetcher.mock.calls.filter(([path]) => path === "/api/apps/surfaces"),
  ).toHaveLength(1);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("keeps merchant credentials absent when signed out and shows a login path", async () => {
  const fetcher = vi.fn(async (path: string) => {
    if (path === "/health" || path === "/api/apps/surfaces")
      return {
        ok: true,
        status: 200,
        json: async () => (path === "/health" ? {} : { surfaces: [] }),
      };
    throw new Error("Protected request while signed out");
  });
  vi.stubGlobal("fetch", fetcher);
  render(<Merchant onChanged={async () => {}} onExit={() => {}} />, {
    wrapper: LocaleProvider,
  });
  const user = userEvent.setup();
  await user.click(
    within(
      screen.getByRole("navigation", { name: "Commerce Studio" }),
    ).getByRole("button", { name: "Shop today" }),
  );
  expect(screen.getByRole("main")).toHaveTextContent("Shop today");
  expect(screen.getByRole("main")).toHaveTextContent(/sign in/i);
  expect(
    fetcher.mock.calls.every(([path]) =>
      ["/health", "/api/apps/surfaces"].includes(path),
    ),
  ).toBe(true);
});
