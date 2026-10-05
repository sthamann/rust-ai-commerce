/** Shared content language and real channel transport stay intact across localized method edits and save boundaries. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import CommerceSettings from "../../src/admin/settings/CommerceSettings";
import AiImageStudio from "../../src/admin/catalog/AiImageStudio";
import settings from "../../../fixtures/demo-settings.json";
it("edits one language, prevents a dirty scope switch and saves the channel's basis revision", async () => {
  const data = structuredClone(settings),
    channel = structuredClone(settings);
  channel.shipping[0].price = 8;
  const request = vi.fn(async (path: string, body?: any) => {
    if (path === "/store-api/countries") return { countries: [] };
    if (path === "/api/automation")
      return {
        channels: [{ id: "second", data: { name: { en: "Second shop" } } }],
      };
    if (body) return { ...body, revision: body.revision + 1 };
    if (path.endsWith("/second"))
      return {
        data: channel,
        revision: 2,
        baseRevision: 4,
        inherited: data,
        overrides: [],
      };
    return { data, revision: 4 };
  });
  render(
    <LocaleProvider>
      <CommerceSettings request={request} area="shipping" canWrite />
    </LocaleProvider>,
  );
  const user = userEvent.setup();
  const scope = await screen.findByLabelText("Settings scope");
  await waitFor(() =>
    expect(
      screen.getByRole("option", { name: "Second shop" }),
    ).toBeInTheDocument(),
  );
  await user.selectOptions(screen.getByLabelText("Content language"), "de-DE");
  await user.selectOptions(scope, "second");
  await waitFor(() =>
    expect(screen.getByLabelText("Shipping fee")).toHaveValue(8),
  );
  expect(screen.getByLabelText("Content language")).toHaveValue("de-DE");
  await user.clear(screen.getByLabelText("Name"));
  await user.type(screen.getByLabelText("Name"), "Channel delivery");
  expect(screen.getAllByLabelText("Name")).toHaveLength(1);
  await user.selectOptions(screen.getByLabelText("Settings scope"), "");
  expect(screen.getByLabelText("Settings scope")).toHaveValue("second");
  expect(screen.getByRole("alert")).toHaveTextContent("Save or discard");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  const save = request.mock.calls.find(([p, b]) => p.endsWith("/second") && b);
  expect(save?.[1].baseRevision).toBe(4);
  expect(save?.[1].data.shipping[0].translations.de.name).toBe(
    "Channel delivery",
  );
});
it("restores a persisted ready image preview after opening the editor again", async () => {
  const request = vi.fn(async (path: string) =>
    path.endsWith("/provider")
      ? { configured: true }
      : path.endsWith("/jobs")
        ? { jobs: [{ id: "ready-image", state: "ready" }] }
        : {
            id: "ready-image",
            state: "ready",
            preview: "data:image/png;base64,fixture",
          },
  );
  render(
    <LocaleProvider>
      <AiImageStudio
        productId="mug"
        revision={2}
        request={request}
        onImage={vi.fn()}
        disabled={false}
      />
    </LocaleProvider>,
  );
  const button = await screen.findByRole("button", {
    name: "Add reviewed image to gallery",
    hidden: true,
  });
  expect(button).toBeEnabled();
  expect(request).toHaveBeenCalledWith("/api/merchant/media/jobs/ready-image");
});
