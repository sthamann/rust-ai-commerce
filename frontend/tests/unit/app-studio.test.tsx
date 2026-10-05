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
