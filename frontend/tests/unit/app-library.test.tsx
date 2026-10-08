/** App management regressions: discovery, multilingual filters, guarded activation and passive artwork fallback. */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import AppsManager from "../../src/admin/apps/AppsManager";
import AppArtwork from "../../src/admin/apps/AppArtwork";
import {
  artworkSource,
  appName,
  appSummary,
} from "../../src/admin/apps/library-model";
import type { Package } from "../../src/admin/apps/app-types";
import { libraryWords } from "../../src/shared/i18n/app-library-i18n";
const p: Package = {
  id: "care_example",
  version: "1.0.0",
  revision: 4,
  active: true,
  manifest: {
    name: { en: "Care guide", de: "Pflegehinweise", es: "Guía" },
    category: "operations",
    permissions: ["data.read"],
    entities: [],
    actions: [],
  },
};
const other = {
  ...p,
  id: "paypal",
  manifest: { ...p.manifest, name: { en: "PayPal" }, category: "payment" },
  active: false,
};
function extra(path: string) {
  if (path.endsWith("credentials"))
    return { canManage: true, digest: "fixture", permissions: [], keys: [] };
  if (path.endsWith("secrets"))
    return {
      revision: 0,
      configured: false,
      canManage: true,
      kinds: [],
      secrets: [],
    };
  if (path.endsWith("activity"))
    return {
      calls: [],
      deliveries: [],
      storage: { rows: 0, bytes: 0, rowLimit: 100000, byteLimit: 67108864 },
      limits: {},
    };
  if (path.endsWith("jobs")) return { jobs: [] };
  if (path.endsWith("review"))
    return {
      app: "storyfront",
      name: { en: "Storyfront" },
      version: "1.0.0",
      digest: "fixture",
      permissions: [],
      added: [],
      previousVersion: null,
    };
}
function setup(role = "owner") {
  const request = vi.fn(
    async (path: string, body?: unknown) =>
      extra(path) ?? {
        packages: [p, other],
        mainLocale: "es-ES",
        ...(path.includes("/care_example") && body ? {} : {}),
      },
  );
  render(
    <LocaleProvider>
      <AppsManager request={request} role={role} token="fixture" />
    </LocaleProvider>,
  );
  return request;
}
it("filters installed apps by translated names, categories and lifecycle without pretending they are connected", async () => {
  setup();
  const user = userEvent.setup();
  await screen.findByRole("button", { name: /Care guide/ });
  await user.type(
    screen.getByRole("searchbox", { name: "Search apps" }),
    "pflege",
  );
  expect(screen.getByRole("button", { name: /Care guide/ })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /PayPal.*Manage app/ }),
  ).not.toBeInTheDocument();
  await user.clear(screen.getByRole("searchbox"));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "All statuses" }),
    "disabled",
  );
  expect(
    screen.getByRole("button", { name: /PayPal.*Manage app/ }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /Care guide/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Discover/ }));
  expect(
    screen.getAllByRole("button", { name: "Install" }).length,
  ).toBeGreaterThan(0);
});
it("opens an app with one click, cancels deactivation and submits the exact revision after confirmation", async () => {
  const request = setup(),
    user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Care guide/ }));
  expect(screen.getByRole("heading", { name: "Care guide" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Disable" }));
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(
    request.mock.calls.filter(([path]) => path === "/api/apps/care_example"),
  ).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Disable" }));
  await user.click(screen.getAllByRole("button", { name: "Disable" }).at(-1)!);
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/apps/care_example",
      { active: false, revision: 4 },
      "PUT",
    ),
  );
});
it("discovers and installs through the existing API, and makes the installed detail visible immediately", async () => {
  const request = vi.fn(async (path: string, body?: unknown) => {
    if (extra(path)) return extra(path);
    if (path === "/api/apps" && body) return {};
    return {
      packages: request.mock.calls.some(
        ([path, b]) => path === "/api/apps" && b,
      )
        ? [
            p,
            {
              ...other,
              id: "storyfront",
              active: true,
              manifest: { ...other.manifest, name: { en: "Storyfront" } },
            },
          ]
        : [p],
      mainLocale: "en-GB",
    };
  });
  const user = userEvent.setup();
  render(
    <LocaleProvider>
      <AppsManager request={request} role="owner" token="fixture" />
    </LocaleProvider>,
  );
  await screen.findByRole("button", { name: /Care guide/ });
  await user.click(screen.getByRole("button", { name: /Discover/ }));
  await user.type(screen.getByRole("searchbox"), "conversational");
  await user.click(screen.getByRole("button", { name: "Install" }));
  await screen.findByRole("dialog");
  const installs = screen.getAllByRole("button", { name: "Install" });
  await user.click(installs.at(-1)!);
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/apps",
      expect.objectContaining({
        builtIn: "storyfront",
        approve: true,
        digest: "fixture",
        permissions: [],
      }),
    ),
  );
  expect(screen.getByRole("heading", { name: "Storyfront" })).toBeVisible();
});
it("disables privileged lifecycle actions for viewers and shows honest empty interface/data states", async () => {
  setup("viewer");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Care guide/ }));
  expect(screen.getByRole("button", { name: "Disable" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "App workspace" }));
  expect(screen.getByText(/no standalone admin page/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "App data" }));
  expect(screen.getByText(/does not define editable/)).toBeVisible();
});
it("uses provided passive artwork and recovers failed cover and icon independently", () => {
  const { container } = render(
    <AppArtwork
      id="custom"
      category="api"
      icon="https://example.test/icon.png"
      cover="/media/shop/cover.webp"
    />,
  );
  const cover = container.querySelector<HTMLImageElement>(".app-cover-image")!;
  expect(cover).toHaveAttribute("src", "/media/shop/cover.webp");
  fireEvent.error(cover);
  expect(container.querySelector(".app-cover-vector")).toBeInTheDocument();
  expect(container.querySelector(".app-logo img")).toBeInTheDocument();
  fireEvent.error(container.querySelector(".app-logo img")!);
  expect(container.querySelector(".app-logo svg")).toBeInTheDocument();
  for (const s of [
    "javascript:alert(1)",
    "//evil.test/x",
    "https://u:p@example.test/a",
    "/media/../secret",
    "data:image/png,x",
  ])
    expect(artworkSource(s)).toBeUndefined();
  expect(artworkSource("https://example.test/a")).toBe(
    "https://example.test/a",
  );
});
it("inherits app text from the shop main language while preserving an explicitly empty summary", () => {
  const app = {
    ...p,
    manifest: {
      ...p.manifest,
      name: { es: "Guía" },
      presentation: { description: { es: "Cuidados", de: "" } },
    },
  };
  expect(appName(app, "fr-FR", "es-ES")).toBe("Guía");
  expect(appSummary(app, "fr-FR", "es-ES", () => "fallback")).toBe("Cuidados");
  expect(appSummary(app, "de-DE", "es-ES", () => "fallback")).toBe("");
  for (const words of Object.values(libraryWords))
    expect(words).toHaveLength(4);
});
it("shows registry-backed native app interfaces using the same permitted surfaces as studio navigation", async () => {
  const { AppSurfaceProvider } =
    await import("../../src/shared/apps/AppSurfaces");
  const { default: AppInterfaces } =
    await import("../../src/admin/apps/AppInterfaces");
  const request = vi.fn(async () => ({
    surfaces: [
      {
        app: p.id,
        version: p.version,
        mainLocale: "en-GB",
        surface: {
          id: "guide",
          location: "admin.navigation",
          label: { en: "Guide editor" },
          actions: [],
        },
        native: {
          view: {
            id: "guide",
            layout: "stack",
            blocks: [
              {
                id: "intro",
                kind: "text",
                title: { en: "Care workspace" },
                text: { en: "Keep your products in great shape" },
              },
            ],
          },
          entities: [],
        },
      },
    ],
  }));
  render(
    <LocaleProvider>
      <AppSurfaceProvider request={request} scopeKey="fixture">
        <AppInterfaces p={p} request={request} />
      </AppSurfaceProvider>
    </LocaleProvider>,
  );
  expect(
    await screen.findByText("Keep your products in great shape"),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Guide editor" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
it("keeps a failed activation visible for retry without changing the displayed app state", async () => {
  const request = vi.fn(async (_path: string, body?: unknown) => {
    if (extra(_path)) return extra(_path);
    if (body) throw new Error("Revision changed");
    return { packages: [p], mainLocale: "en-GB" };
  });
  const user = userEvent.setup();
  render(
    <LocaleProvider>
      <AppsManager request={request} token="fixture" role="owner" />
    </LocaleProvider>,
  );
  await user.click(await screen.findByRole("button", { name: /Care guide/ }));
  await user.click(screen.getByRole("button", { name: "Disable" }));
  await user.click(screen.getAllByRole("button", { name: "Disable" }).at(-1)!);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Revision changed",
  );
  expect(screen.getByRole("dialog")).toBeVisible();
});
it("shows built-in apps immediately for a fresh hosted shop without installing external integrations", async () => {
  const request = vi.fn(async (_path: string, _body?: unknown) => ({
    packages: [],
    mainLocale: "en-GB",
  }));
  render(
    <LocaleProvider>
      <AppsManager request={request} role="owner" token="fixture" />
    </LocaleProvider>,
  );
  expect(await screen.findByText("PayPal")).toBeVisible();
  expect(
    screen.getAllByRole("button", { name: "Install" }).length,
  ).toBeGreaterThan(5);
  expect(request.mock.calls.every((call) => call[1] === undefined)).toBe(true);
});
