/** Actual mount discovery, passive editor navigation and cross-workspace stale-response regressions. */
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import StoryfrontView from "../../src/admin/storyfronts/StoryfrontView";
import { connectionUrl } from "../../src/admin/storyfronts/storyfront-model";
import { storyfrontWords } from "../../src/admin/storyfronts/storyfront-i18n";
const mounted = {
  alias: "retro-shop",
  channel: "experience_retro",
  url: "https://retro-shop.example.test/",
  editorUrl: "https://experience.example.test/design/retro-shop",
};
function view(request: any) {
  return (
    <LocaleProvider>
      <StoryfrontView request={request} role="owner" />
    </LocaleProvider>
  );
}
it("discovers an existing Experience without installing a connector and opens its actual editor and storefront", async () => {
  const request = vi.fn(async (path: string, _body?: unknown) =>
    path.endsWith("frontends") ? { frontends: [mounted] } : { packages: [] },
  );
  render(view(request));
  const edit = await screen.findByRole("link", { name: "Edit experience" });
  expect(edit).toHaveAttribute("href", mounted.editorUrl + "?locale=en-GB");
  expect(screen.getByRole("link", { name: "Open shop" })).toHaveAttribute(
    "href",
    mounted.url,
  );
  expect(screen.getByRole("heading", { name: "retro-shop" })).toBeVisible();
  expect(screen.getByText(mounted.channel)).toBeVisible();
  expect(
    screen.queryByText(/operator needs to connect/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Add Storyfront integration" }),
  ).not.toBeInTheDocument();
  expect(request.mock.calls.every(([, body]) => body === undefined)).toBe(true);
});
it("shows loading and recoverable errors rather than a false unconnected state; refresh retries the real APIs", async () => {
  let failed = true;
  const request = vi.fn(async (path: string) => {
    if (path.endsWith("frontends") && failed)
      throw new Error("private database error");
    return path.endsWith("frontends")
      ? { frontends: [mounted] }
      : { packages: [] };
  });
  render(view(request));
  expect(screen.getByRole("status")).toHaveTextContent(
    "Loading your experiences",
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Connections could not be loaded",
  );
  expect(
    screen.queryByRole("button", { name: "Add Storyfront integration" }),
  ).not.toBeInTheDocument();
  failed = false;
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Refresh connections" }));
  expect(
    await screen.findByRole("link", { name: "Edit experience" }),
  ).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("never retains another workspace's mount when its late response arrives", async () => {
  let late: (v: any) => void = () => {};
  const old = vi.fn((path: string) =>
    path.endsWith("frontends")
      ? new Promise((resolve) => {
          late = resolve;
        })
      : Promise.resolve({ packages: [] }),
  );
  const next = vi.fn(async (path: string) =>
    path.endsWith("frontends") ? { frontends: [] } : { packages: [] },
  );
  const rendered = render(view(old));
  rendered.rerender(view(next));
  await screen.findByRole("button", { name: "Add Storyfront integration" });
  await act(async () => late({ frontends: [mounted] }));
  expect(
    screen.queryByRole("heading", { name: mounted.alias }),
  ).not.toBeInTheDocument();
});
it("keeps connected mounts visible without an editor configuration and localizes navigation", async () => {
  localStorage.setItem("rac-locale", "de-DE");
  render(
    view(
      vi.fn(async (path: string) =>
        path.endsWith("frontends")
          ? { frontends: [{ ...mounted, editorUrl: null }] }
          : { packages: [] },
      ),
    ),
  );
  expect(
    await screen.findByRole("link", { name: "Shop öffnen" }),
  ).toBeVisible();
  expect(
    screen.getByText(
      "Der Betreiber hat den Editor-Link noch nicht konfiguriert.",
    ),
  ).toBeVisible();
  for (const words of Object.values(storyfrontWords))
    expect(words).toHaveLength(4);
});
it("rejects active or credential-bearing URLs and accepts only HTTPS or explicit local fixtures", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,x",
    "//foreign.test/x",
    "https://user:secret@foreign.test/",
    "http://169.254.169.254/",
  ])
    expect(connectionUrl(value)).toBeUndefined();
  expect(connectionUrl("http://127.0.0.1:4420/design/demo", "es-ES")).toBe(
    "http://127.0.0.1:4420/design/demo?locale=es-ES",
  );
  expect(connectionUrl(null)).toBeUndefined();
});
