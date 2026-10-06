/** Developer API console exercises scopes, key lifetime, revoke confirmation and read-only route safety. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import IntegrationKeys from "../../src/admin/developer/api/IntegrationKeys";
import ApiExplorer, {
  routePath,
} from "../../src/admin/developer/api/ApiExplorer";
it("creates a bounded explicit-scope key, shows it once and revokes only after confirmation", async () => {
  const user = userEvent.setup();
  let keys: any[] = [];
  const request = vi.fn(async (path: string, body?: any, method?: string) => {
    if (path === "/api/auth/access")
      return { permissions: ["team.manage", "catalog.read"] };
    if (method === "POST") {
      keys = [
        {
          id: "key",
          name: body.name,
          permissions: body.permissions,
          expiresAt: "2030-01-01T00:00:00Z",
        },
      ];
      return { key: "synthetic-key" };
    }
    if (method === "DELETE") {
      keys = [];
      return {};
    }
    return { elements: keys };
  });
  render(
    <LocaleProvider>
      <IntegrationKeys request={request} />
    </LocaleProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Create key" }).closest("fieldset"),
    ).not.toBeDisabled(),
  );
  await user.type(screen.getByLabelText("Key name"), "Catalog reader");
  await user.click(screen.getByText("catalog.read"));
  await user.click(screen.getByRole("button", { name: "Create key" }));
  expect(request).toHaveBeenCalledWith(
    "/api/workspace/integrations",
    {
      name: "Catalog reader",
      expiresInDays: 30,
      permissions: ["catalog.read"],
    },
    "POST",
  );
  expect(await screen.findByLabelText("Integration keys")).toHaveValue(
    "synthetic-key",
  );
  await user.click(screen.getByRole("button", { name: "Clear key" }));
  expect(screen.queryByLabelText("Integration keys")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Revoke key" }));
  expect(request.mock.calls.some((c) => c[2] === "DELETE")).toBe(false);
  await user.click(
    screen.getAllByRole("button", { name: "Revoke key" }).at(-1)!,
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/workspace/integrations/key",
      undefined,
      "DELETE",
    ),
  );
});
it("does not fetch keys or offer creation without team management", async () => {
  const request = vi.fn(async () => ({ permissions: ["catalog.read"] }));
  render(
    <LocaleProvider>
      <IntegrationKeys request={request} />
    </LocaleProvider>,
  );
  await screen.findByText("catalog.read");
  expect(
    screen.getByRole("button", { name: "Create key" }).closest("fieldset"),
  ).toBeDisabled();
  expect(request).toHaveBeenCalledTimes(1);
});
it("live tests the existing scoped request and prevents path escape and write testing", async () => {
  const user = userEvent.setup(),
    request = vi.fn(async (path: string) =>
      path === "/api/apps" ? { packages: [] } : { elements: [{ id: "safe" }] },
    );
  render(
    <LocaleProvider>
      <ApiExplorer request={request} workspace="shop-test" />
    </LocaleProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Run read request" }));
  expect(request).toHaveBeenCalledWith(
    "/api/merchant/products",
    undefined,
    "GET",
  );
  expect(await screen.findByRole("status")).toHaveTextContent("safe");
  await user.type(screen.getByRole("searchbox"), "POST /api/workspaces");
  await user.click(
    screen.getByRole("button", { name: "POST /api/workspaces" }),
  );
  expect(
    screen.getByRole("button", { name: "Run read request" }),
  ).toBeDisabled();
  for (const path of [
    "GET /mcp",
    "GET /api/merchant/receipts/{id}/pdf",
    "GET /store-api/company-logo/{id}",
  ]) {
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), path);
    await user.click(screen.getByRole("button", { name: path }));
    expect(
      screen.getByRole("button", { name: "Run read request" }),
    ).toBeDisabled();
  }
  const route = {
    path: "/api/merchant/products/{id}",
    method: "GET",
    source: "fixture",
  };
  expect(() => routePath(route, { id: "../foreign" })).toThrow();
  expect(() => routePath(route, { id: ".." })).toThrow();
  expect(routePath(route, { id: "safe id" })).toBe(
    "/api/merchant/products/safe%20id",
  );
});
