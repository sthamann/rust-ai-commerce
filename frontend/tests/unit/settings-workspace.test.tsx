/** Settings regressions cover real scoped saves, locale draft retention, navigation guards and read-only access. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import SettingsWorkspace from "../../src/admin/settings/SettingsWorkspace";
import MasterDataSettings from "../../src/admin/settings/MasterDataSettings";
const initial = {
  revision: 3,
  data: {
    name: "Unit shop",
    address: "Synthetic street",
    taxId: "FIXTURE",
    email: "",
    phoneNumber: "",
    website: "",
    registrationNumber: "",
    bankName: "",
    iban: "",
    bic: "",
  },
};
function api() {
  let record = structuredClone(initial);
  return vi.fn(async (path: string, body?: any, method?: string) => {
    if (path === "/api/merchant/commerce")
      return {
        revision: 2,
        data: {
          countries: ["DE"],
          taxes: [{ id: "standard", rates: { DE: 19 } }],
          shipping: [],
          payments: [],
        },
      };
    if (method === "PUT") {
      record = { ...body, revision: body.revision + 1 };
      return { saved: true, revision: record.revision };
    }
    return structuredClone(record);
  });
}
const props = {
  rights: ["settings.write"],
  onConnections: vi.fn(),
  onTeam: vi.fn(),
  onAutomation: vi.fn(),
};
it("saves one complete master record, then uses the returned revision for the next edit", async () => {
  const request = api(),
    user = userEvent.setup();
  render(<SettingsWorkspace {...props} request={request} />, {
    wrapper: LocaleProvider,
  });
  expect(await screen.findByDisplayValue("Unit shop")).toBeVisible();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await user.type(
    screen.getByLabelText("Email", { exact: true }),
    "support@example.test",
  );
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Changes saved"),
  );
  expect(request).toHaveBeenCalledWith(
    "/api/settings/master-data",
    expect.objectContaining({
      revision: 3,
      data: expect.objectContaining({
        email: "support@example.test",
        taxId: "FIXTURE",
      }),
    }),
    "PUT",
  );
  await user.type(screen.getByLabelText("Phone number"), "123");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/settings/master-data",
      expect.objectContaining({ revision: 4 }),
      "PUT",
    ),
  );
});
it("requires explicit discard before switching settings with a dirty draft", async () => {
  const user = userEvent.setup(),
    request = api();
  render(<SettingsWorkspace {...props} request={request} />, {
    wrapper: LocaleProvider,
  });
  await screen.findByDisplayValue("Unit shop");
  await user.type(screen.getByLabelText("Name", { exact: true }), " edited");
  await user.click(screen.getByRole("button", { name: /Countries/ }));
  expect(screen.getByRole("alert")).toHaveTextContent("unsaved changes");
  expect(screen.getByLabelText("Name", { exact: true })).toHaveValue(
    "Unit shop edited",
  );
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Countries/ }));
  await user.click(
    screen.getByRole("button", { name: "Discard and continue" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Countries" }),
  ).toBeVisible();
  expect(
    screen.queryByLabelText("Name", { exact: true }),
  ).not.toBeInTheDocument();
});
it("keeps an edited draft when the locale transport changes and reports revision conflicts without erasing it", async () => {
  const request = api(),
    current = vi.fn(async () => {
      throw Error("Receipt settings changed");
    }),
    user = userEvent.setup();
  const view = (r: any) => (
    <LocaleProvider>
      <MasterDataSettings request={r} canWrite={true} />
    </LocaleProvider>
  );
  const { rerender } = render(view(request));
  await screen.findByDisplayValue("Unit shop");
  await user.type(screen.getByLabelText("Name", { exact: true }), " edited");
  rerender(view(current));
  expect(screen.getByLabelText("Name", { exact: true })).toHaveValue(
    "Unit shop edited",
  );
  expect(current).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Receipt settings changed",
  );
  expect(screen.getByLabelText("Name", { exact: true })).toHaveValue(
    "Unit shop edited",
  );
});
it("shows master data without offering writes to a read-only teammate", async () => {
  render(<MasterDataSettings request={api()} canWrite={false} />, {
    wrapper: LocaleProvider,
  });
  expect(await screen.findByDisplayValue("Unit shop")).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Save changes" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Read-only access");
});
it.each([
  ["de-DE", "Länder"],
  ["en-GB", "Countries"],
  ["fr-FR", "Pays"],
  ["es-ES", "Países"],
])(
  "translates the countries navigation and panel in %s",
  async (locale, label) => {
    localStorage.setItem("rac-locale", locale);
    render(<SettingsWorkspace {...props} request={api()} />, {
      wrapper: LocaleProvider,
    });
    await screen.findByDisplayValue("Unit shop");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: new RegExp(label) }));
    expect(await screen.findByRole("heading", { name: label })).toBeVisible();
    expect(
      screen.queryByText("countries", { exact: true }),
    ).not.toBeInTheDocument();
  },
);
