/** Guided contracts and host-bound editors retain real access flags, owned filters and record revisions. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import SandboxContextPicker from "../../src/admin/developer/SandboxContextPicker";
import AppAssistant from "../../src/admin/developer/AppAssistant";
import AppActionAccess from "../../src/admin/developer/AppActionAccess";
import NativeAppView from "../../src/shared/apps/native/NativeAppView";
import { ContentLanguage } from "../../src/shared/i18n/ContentLanguage";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import {
  appKinds,
  assistedManifest,
  type AppKind,
} from "../../src/admin/developer/assistant-model";
import { compile } from "../../src/admin/developer/app-model";
const draft = (kind: AppKind = "admin", location = "admin.product.tab") =>
  assistedManifest({
    kind,
    location,
    id: "test_app",
    name: { en: "Care", de: "Pflege", es: "Cuidado" },
    mcp: false,
    publicRead: kind === "combined",
    event: "order.placed",
    cron: "0 */15 * * * *",
  });
for (const kind of appKinds)
  it(`produces editable ${kind} contracts without losing access flags on repeated compilation`, () => {
    const m = draft(
      kind,
      kind === "frontend" || kind === "combined"
        ? "product.detail"
        : "admin.navigation",
    );
    expect(compile(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(m.actions!.every((a) => a.mcp === false)).toBe(true);
    expect(
      m.actions!.filter((a) => a.public).every((a) => a.handler === "list"),
    ).toBe(true);
    if (["payment", "shipping", "integration", "event"].includes(kind)) {
      expect(m.runtime).toBe("service");
      expect(m.actions!.some((a) => a.handler === "service")).toBe(true);
      expect(m.events).toEqual(["order.placed"]);
    }
    if (kind === "scheduled")
      expect(m.schedules![0].cron).toBe("0 */15 * * * *");
    if (kind === "webhook") expect(m.webhooks![0].action).toBe("received");
  });
it("guides an admin app into the customer editor with private choices and correct rights", async () => {
  const onCreate = vi.fn(),
    user = userEvent.setup();
  render(
    <ContentLanguage locales={["en-GB", "de-DE", "es-ES"]} mainLocale="en-GB">
      <AppAssistant onCreate={onCreate} onClose={() => {}} />
    </ContentLanguage>,
    { wrapper: LocaleProvider },
  );
  await user.click(screen.getByRole("button", { name: /Admin app/ }));
  await user.selectOptions(
    screen.getByLabelText("Where should it appear?"),
    "admin.customer",
  );
  await user.click(screen.getByLabelText("Expose action to MCP / agents"));
  await user.click(
    screen.getByRole("button", { name: "Create editable draft" }),
  );
  const m = onCreate.mock.calls[0][0];
  expect(m.entities[0].publicRead).toBe(false);
  expect(m.entities[0].fields[0].coreReference).toBe("customer");
  expect(m.views[0].blocks[0].contextBinding).toEqual({
    field: "customer_id",
    key: "customerId",
  });
  expect(m.actions.find((a: any) => a.handler === "save")).toMatchObject({
    permission: "customers.write",
    mcp: true,
  });
});
it("shows connector requirements rather than pretending to deploy a payment provider", async () => {
  render(
    <ContentLanguage locales={["en-GB"]} mainLocale="en-GB">
      <AppAssistant onCreate={() => {}} onClose={() => {}} />
    </ContentLanguage>,
    { wrapper: LocaleProvider },
  );
  await userEvent.click(
    screen.getByRole("button", { name: /Payment connector/ }),
  );
  expect(
    screen.getByText(/not an implemented payment or shipping provider/),
  ).toBeVisible();
});
it("changes actual action rights and MCP flags and preserves them through schema edits", async () => {
  let result = draft(),
    user = userEvent.setup();
  render(
    <AppActionAccess
      manifest={result}
      onChange={(m) => {
        result = compile(m);
      }}
    />,
    { wrapper: LocaleProvider },
  );
  const selectors = screen.getAllByLabelText("Required team permission");
  await user.selectOptions(selectors[1], "orders.write");
  expect(result.actions!.find((a) => a.handler === "save")!.permission).toBe(
    "orders.write",
  );
  await user.click(
    screen.getAllByLabelText("Expose action to MCP / agents")[1],
  );
  expect(result.actions!.find((a) => a.handler === "save")!.mcp).toBe(true);
});
it("does not fetch unfiltered app data without the required host context", async () => {
  const m = draft(),
    request = vi.fn();
  render(
    <NativeAppView
      app={m.id}
      native={{ view: m.views![0], entities: m.entities }}
      request={request}
      allowedActions={m.surfaces![0].actions}
    />,
    { wrapper: LocaleProvider },
  );
  expect(screen.getByText(/Open a matching product/)).toBeVisible();
  expect(request).not.toHaveBeenCalled();
});
it("hydrates product-scoped fields, hides the technical reference and saves the existing revision", async () => {
  const m = draft(),
    user = userEvent.setup(),
    request = vi.fn(async (path: string, body?: any) => {
      if (path.endsWith("list_entries"))
        return {
          elements: [
            {
              id: "care",
              revision: 4,
              product_id: "mug",
              title: { en: "Original" },
              body: { en: "Text" },
              segment: "standard",
            },
          ],
        };
      return { id: body.id, revision: 5 };
    });
  render(
    <NativeAppView
      app={m.id}
      native={{ view: m.views![0], entities: m.entities }}
      request={request}
      allowedActions={m.surfaces![0].actions}
      context={{ productId: "mug" }}
    />,
    { wrapper: LocaleProvider },
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Title")).toHaveValue("Original"),
  );
  expect(request).toHaveBeenCalledWith(
    "/api/apps/test_app/actions/list_entries",
    { limit: 50, filter: { product_id: "mug" } },
  );
  expect(screen.queryByLabelText("Core object")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Record")).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Selection"), "priority");
  await user.click(screen.getByRole("button", { name: "Save record" }));
  expect(request).toHaveBeenCalledWith(
    "/api/apps/test_app/actions/save_entries",
    {
      id: "care",
      revision: 4,
      fields: {
        product_id: "mug",
        title: { en: "Original" },
        body: { en: "Text" },
        segment: "priority",
      },
    },
  );
});

it("uses the parent product language without losing regional app translations or adding a second picker", async () => {
  const m = draft();
  const request = vi.fn(async () => ({
    elements: [
      {
        id: "care",
        revision: 1,
        product_id: "mug",
        title: { "en-GB": "Regional content" },
        segment: "standard",
      },
    ],
  }));
  render(
    <ContentLanguage locales={["en", "de"]} mainLocale="en" language="en">
      <NativeAppView
        app={m.id}
        native={{ view: m.views![0], entities: m.entities }}
        request={request}
        allowedActions={m.surfaces![0].actions}
        context={{ productId: "mug" }}
        mainLocale="en-GB"
        locales={["en-GB", "de-DE"]}
        inheritContentLanguage
      />
    </ContentLanguage>,
    { wrapper: LocaleProvider },
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Title")).toHaveValue("Regional content"),
  );
  expect(screen.queryByLabelText("Content language")).not.toBeInTheDocument();
});

it("searches sandbox products with the actual catalog parameter and returns an owned host context", async () => {
  const request = vi.fn(async () => ({
      elements: [{ id: "mug", name: { en: "Cup" } }],
    })),
    onSelect = vi.fn(),
    user = userEvent.setup();
  render(
    <SandboxContextPicker
      binding={{ field: "product_id", key: "productId" }}
      request={request}
      mainLocale="en-GB"
      onSelect={onSelect}
    />,
    { wrapper: LocaleProvider },
  );
  await user.type(screen.getByLabelText("Find a test object"), "Cup");
  await waitFor(() =>
    expect(request).toHaveBeenLastCalledWith(
      "/api/merchant/products?limit=50&search=Cup",
    ),
  );
  await user.selectOptions(screen.getByLabelText("Core object"), "mug");
  expect(onSelect).toHaveBeenCalledWith({ productId: "mug" });
});
