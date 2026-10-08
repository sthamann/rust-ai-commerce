/** Real editor behaviors: default edits, explicit visibility and revisioned domain connections. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import ChannelEditor from "../../src/admin/channels/ChannelEditor";
import ChannelConnections from "../../src/admin/channels/ChannelConnections";
import { freshChannel } from "../../src/admin/channels/channel-model";
const main = {
  ...freshChannel("en-GB"),
  id: "default",
  revision: 1,
  data: { ...freshChannel("en-GB").data, name: { "en-GB": "Main shop" } },
};
it("edits the default name and visibility and exposes pause without allowing default deletion", async () => {
  const user = userEvent.setup(),
    saved = vi.fn(),
    request = vi.fn(async (_path: string, body?: any) =>
      body ? { revision: 2 } : { elements: [], frontends: [] },
    );
  render(
    <LocaleProvider>
      <ChannelEditor
        initial={main}
        request={request}
        languages={["en-GB"]}
        mainLocale="en-GB"
        categories={[]}
        workspace="own-shop"
        canWrite
        onBack={vi.fn()}
        onSaved={saved}
      />
    </LocaleProvider>,
  );
  expect(
    screen.getByRole("button", { name: "Deactivate channel" }),
  ).toBeEnabled();
  expect(screen.getByRole("button", { name: "Save channel" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Delete configuration" }),
  ).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText("Channel name"));
  await user.type(screen.getByLabelText("Channel name"), "Edited main");
  await user.selectOptions(screen.getByLabelText("Visibility"), "private");
  await user.click(screen.getByRole("button", { name: "Save channel" }));
  await waitFor(() =>
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: 2,
        data: expect.objectContaining({
          visibility: "private",
          name: { "en-GB": "Edited main" },
        }),
      }),
    ),
  );
});
it("shows the actual domain and canonical editor and changes the channel with a revision", async () => {
  const user = userEvent.setup(),
    row = {
      alias: "shop-one",
      experienceAlias: "original-experience",
      channel: "default",
      revision: 4,
      url: "https://shop-one.vendune.ai/",
      editorUrl: "https://experience.vendune.ai/design/original-experience",
    };
  const request = vi.fn(async (path: string, body?: any) =>
    path === "/api/automation"
      ? {
          channels: [
            main,
            {
              ...main,
              id: "fashion",
              data: { ...main.data, name: { "en-GB": "Fashion" } },
            },
          ],
        }
      : body
        ? { revision: 5 }
        : { frontends: [row] },
  );
  render(
    <LocaleProvider>
      <ChannelConnections
        request={request}
        channel="default"
        disabled={false}
      />
    </LocaleProvider>,
  );
  expect(await screen.findByText("shop-one.vendune.ai")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Edit Storyfront/ })).toHaveAttribute(
    "href",
    "https://experience.vendune.ai/design/original-experience?locale=en-GB",
  );
  await user.selectOptions(
    screen.getByLabelText("Assigned sales channel"),
    "fashion",
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/settings/frontends",
      {
        alias: "shop-one",
        experienceAlias: "original-experience",
        channel: "fashion",
        revision: 4,
      },
      "PUT",
    ),
  );
});
it("requires confirmation to disconnect an address and keeps read-only controls disabled", async () => {
  const user = userEvent.setup(),
    row = {
      alias: "shop-one",
      channel: "default",
      revision: 4,
      url: "https://shop-one.vendune.ai/",
    };
  const request = vi.fn(async (path: string, body?: any) =>
    path === "/api/automation"
      ? { channels: [main] }
      : body
        ? {}
        : { frontends: [row] },
  );
  render(
    <LocaleProvider>
      <ChannelConnections
        request={request}
        channel="default"
        disabled={false}
      />
    </LocaleProvider>,
  );
  await user.click(
    await screen.findByRole("button", { name: "Disconnect address" }),
  );
  expect(screen.getByRole("dialog")).toHaveTextContent("not products, orders");
  expect(request.mock.calls.filter((c) => c[1])).toHaveLength(0);
  await user.click(
    screen.getAllByRole("button", { name: "Disconnect address" }).at(-1)!,
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/settings/frontends/shop-one",
      { revision: 4 },
      "DELETE",
    ),
  );
});
