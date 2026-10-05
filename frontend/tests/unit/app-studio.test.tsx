/** Click-to-build, agent round-trip and immutable build lifecycle checks without paid inference. */
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import DeveloperView from "../../src/admin/developer/DeveloperView";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { template } from "../../src/admin/developer/app-model";
function setup() {
  let build: any;
  const request = vi.fn(async (path: string, body?: any) => {
    if (path === "/api/developer")
      return {
        builds: build ? [build] : [],
        providers: {
          providers: [{ id: "ollama", model: "fixture", configured: false }],
        },
        locales: ["en-GB", "de-DE", "es-ES"],
        mainLocale: "en-GB",
      };
    if (path === "/api/developer/import") {
      build = {
        id: "b",
        digest: "digest",
        state: "draft",
        app: body.manifest.id,
        version: body.manifest.version,
        manifest: body.manifest,
        summary: body.summary,
        environment: body.environment,
      };
      return build;
    }
    if (path.endsWith("/stage")) {
      build = { ...build, state: "staged" };
      return {};
    }
    if (path.endsWith("/diff"))
      return {
        changes: [
          {
            key: `app:${build.app}`,
            digest: "release-digest",
            conflict: false,
            before: null,
            after: build.manifest,
          },
          { key: "product:lamp", digest: "other", conflict: false },
        ],
      };
    if (path.endsWith("/release")) return {};
    throw Error(path);
  });
  render(
    <DeveloperView
      request={request}
      sandboxRequest={() => request}
      environments={[{ id: "sandbox", name: "Private sandbox" }]}
      role="owner"
      onRefresh={vi.fn(async () => {})}
      onFlows={vi.fn()}
    />,
    { wrapper: LocaleProvider },
  );
  return { request };
}
it("adds and reorders real schema blocks, then saves, stages and releases only the app package", async () => {
  const { request } = setup(),
    user = userEvent.setup();
  await screen.findByRole("button", { name: "Save new version" });
  await user.click(screen.getByRole("button", { name: /^Cards$/ }));
  await user.click(screen.getByRole("button", { name: "Move up" }));
  await user.click(screen.getByRole("button", { name: "Save new version" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Save new version" }),
    ).toBeDisabled(),
  );
  const saved = request.mock.calls.find(
    (c) => c[0] === "/api/developer/import",
  )![1];
  expect(saved.manifest.views[0].blocks[2].kind).toBe("cards");
  expect(saved.manifest.actions[1].handler).toBe("save");
  await user.click(screen.getByRole("button", { name: /Versions & releases/ }));
  await user.click(
    await screen.findByRole("button", { name: "Approve & install in sandbox" }),
  );
  await screen.findByText("Installed in sandbox");
  await user.click(screen.getByRole("button", { name: "Review changes" }));
  await user.click(
    await screen.findByRole("button", { name: "Publish this app version" }),
  );
  expect(request).toHaveBeenCalledWith("/api/environments/sandbox/release", {
    approve: true,
    selections: [{ key: `app:${saved.manifest.id}`, digest: "release-digest" }],
  });
});
it("applies an agent manifest to the same canvas, preserving content and custom fields", async () => {
  setup();
  const user = userEvent.setup();
  await screen.findByText(/care_/);
  await user.click(screen.getByRole("button", { name: "Coding agent" }));
  const m = template();
  m.id = "agent_app";
  m.entities[0].fields.push({
    name: "care_score",
    label: { en: "Score", de: "Wert", es: "Valor" },
    kind: "integer",
  });
  fireEvent.change(screen.getByLabelText("Package contract"), {
    target: { value: JSON.stringify(m) },
  });
  await user.click(
    screen.getByRole("button", { name: "Apply agent JSON to canvas" }),
  );
  await user.click(screen.getByRole("button", { name: "Data models" }));
  expect(screen.getByDisplayValue("care_score")).toBeVisible();
});
it("opens a saved app card directly on the editable canvas and saves a new version", async () => {
  const { request } = setup(),
    user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Save new version" }),
  );
  const original = request.mock.calls.find(
    (c) => c[0] === "/api/developer/import",
  )![1];
  await user.click(screen.getByRole("button", { name: "Coding agent" }));
  await user.click(
    screen.getByRole("button", {
      name: /Product care guide.*Open for editing/,
    }),
  );
  expect(
    screen.getByRole("button", { name: "Design", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  expect(screen.getByLabelText("Version")).toHaveValue("0.1.1");
  await user.clear(screen.getByLabelText("App name"));
  await user.type(screen.getByLabelText("App name"), "Updated guide");
  await user.click(screen.getByRole("button", { name: "Save new version" }));
  await waitFor(() =>
    expect(
      request.mock.calls.filter((c) => c[0] === "/api/developer/import"),
    ).toHaveLength(2),
  );
  const next = request.mock.calls.filter(
    (c) => c[0] === "/api/developer/import",
  )[1][1];
  expect(next.manifest.version).toBe("0.1.1");
  expect(next.manifest.name.en).toBe("Updated guide");
  expect(original.manifest.version).toBe("0.1.0");
  expect(original.manifest.name.en).toBe("Product care guide");
});
it("returns from version editing and the explicit edit button to the design workspace", async () => {
  setup();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Save new version" }),
  );
  await user.click(screen.getByRole("button", { name: /Versions & releases/ }));
  await user.click(
    screen.getByRole("button", { name: "Edit as next version" }),
  );
  expect(screen.getByLabelText("Version")).toHaveValue("0.1.1");
  expect(
    screen.getByRole("button", { name: "Design", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await user.click(screen.getByRole("button", { name: "Data models" }));
  await user.click(screen.getByRole("button", { name: "Edit app" }));
  expect(screen.getByLabelText("Version")).toHaveValue("0.1.1");
  expect(
    screen.getByRole("button", { name: "Design", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

it("automatically starts a new version when an already-saved canvas is edited directly", async () => {
  setup();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Save new version" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Save new version" }),
    ).toBeDisabled(),
  );
  await user.clear(screen.getByLabelText("App name"));
  await user.type(screen.getByLabelText("App name"), "Direct edit");
  expect(screen.getByLabelText("Version")).toHaveValue("0.1.1");
  expect(
    screen.getByRole("button", { name: "Save new version" }),
  ).toBeEnabled();
});
