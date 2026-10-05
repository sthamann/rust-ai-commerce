/** Company editing regressions: sparse channel overrides, safe scope switching, languages and real logo draft lifecycle. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import MasterDataSettings from "../../src/admin/settings/MasterDataSettings";
import CompanyLogo from "../../src/admin/settings/CompanyLogo";
import CompanyTranslations from "../../src/admin/settings/CompanyTranslations";
import { ContentLanguage } from "../../src/shared/i18n/ContentLanguage";
const base = {
  name: "Synthetic GmbH",
  street: "Test road",
  houseNumber: "12",
  postalCode: "10115",
  city: "Berlin",
  country: "DE",
  phoneNumber: "123",
  address: "Test road 12",
  brandName: { "es-ES": "Marca" },
  legalNotice: { "es-ES": "Aviso" },
};
function api() {
  let shared = { data: structuredClone(base), revision: 2 };
  let north: any = {
    data: {},
    inherited: shared.data,
    effective: shared.data,
    revision: 0,
    baseRevision: 2,
  };
  return vi.fn(async (path: string, body?: any, method?: string) => {
    if (path === "/store-api/countries")
      return {
        countries: [
          {
            code: "DE",
            alpha3: "DEU",
            numeric: "276",
            continent: "EU",
            name: { en: "Germany" },
            states: [],
          },
        ],
        mainLocale: "es-ES",
        locales: ["es-ES", "de-DE", "it-IT"],
        enabled: ["DE"],
      };
    if (path === "/api/automation")
      return {
        channels: [
          { id: "north", data: { name: { en: "North", es: "Norte" } } },
        ],
      };
    if (method === "PUT") {
      if (path.endsWith("north"))
        north = { ...body, revision: body.revision + 1 };
      else shared = { ...body, revision: body.revision + 1 };
      return path.endsWith("north") ? north : shared;
    }
    return path.endsWith("north")
      ? structuredClone(north)
      : structuredClone(shared);
  });
}
it("writes only the changed channel field and explicitly restores inheritance", async () => {
  const request = api(),
    user = userEvent.setup();
  render(<MasterDataSettings request={request} canWrite />, {
    wrapper: LocaleProvider,
  });
  await screen.findByDisplayValue("Synthetic GmbH");
  await screen.findByRole("option", { name: "North" });
  await user.selectOptions(screen.getByLabelText("Applies to"), "north");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Restore inheritance · Name" }),
    ).toBeDisabled(),
  );
  await user.clear(screen.getByLabelText("Name", { exact: true }));
  await user.type(screen.getByLabelText("Name", { exact: true }), "North GmbH");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/settings/master-data/channels/north",
      expect.objectContaining({
        revision: 0,
        baseRevision: 2,
        data: { name: "North GmbH" },
      }),
      "PUT",
    ),
  );
  await user.click(
    screen.getByRole("button", { name: "Restore inheritance · Name" }),
  );
  expect(screen.getByLabelText("Name", { exact: true })).toHaveValue(
    "Synthetic GmbH",
  );
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/settings/master-data/channels/north",
      expect.objectContaining({ revision: 1, data: { name: null } }),
      "PUT",
    ),
  );
});
it("does not discard an edited address when selecting another sales channel", async () => {
  const user = userEvent.setup();
  render(<MasterDataSettings request={api()} canWrite />, {
    wrapper: LocaleProvider,
  });
  await screen.findByDisplayValue("Synthetic GmbH");
  await screen.findByRole("option", { name: "North" });
  await user.type(screen.getByLabelText("House number"), "A");
  await user.selectOptions(screen.getByLabelText("Applies to"), "north");
  expect(screen.getByRole("alert")).toHaveTextContent("Save or discard");
  expect(screen.getByLabelText("House number")).toHaveValue("12A");
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("Applies to")).toHaveValue("");
});
it("shows one enabled language and saves a new language without copying inherited text", async () => {
  const request = api(),
    user = userEvent.setup();
  render(<MasterDataSettings request={request} canWrite />, {
    wrapper: LocaleProvider,
  });
  await screen.findByDisplayValue("Synthetic GmbH");
  const language = await screen.findByLabelText("Content language");
  await user.selectOptions(language, "it-IT");
  expect(screen.getAllByLabelText("Storefront brand name")).toHaveLength(1);
  expect(screen.getByLabelText("Storefront brand name")).toHaveAttribute(
    "placeholder",
    "Marca",
  );
  await user.type(screen.getByLabelText("Storefront brand name"), "Marchio");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/settings/master-data",
      expect.objectContaining({
        data: expect.objectContaining({
          brandName: { "es-ES": "Marca", "it-IT": "Marchio" },
        }),
      }),
      "PUT",
    ),
  );
});
it("keeps channel and language inheritance independent, including explicit blank text", async () => {
  const onChange = vi.fn(),
    user = userEvent.setup();
  render(
    <LocaleProvider>
      <ContentLanguage
        locales={["es-ES", "it-IT"]}
        mainLocale="es-ES"
        language="it-IT"
      >
        <CompanyTranslations
          data={{}}
          base={{ brandName: { "es-ES": "Marca" } }}
          channel
          onChange={onChange}
        />
      </ContentLanguage>
    </LocaleProvider>,
  );
  expect(screen.getByLabelText("Storefront brand name")).toHaveAttribute(
    "placeholder",
    "Marca",
  );
  await user.type(screen.getByLabelText("Storefront brand name"), "M");
  expect(onChange).toHaveBeenLastCalledWith({ brandName: { "it-IT": "M" } });
});
it("uploads a bounded logo into the draft and rejects unsupported files before a request", async () => {
  const request = vi.fn(async () => ({ id: "logo-one" })),
    onChange = vi.fn(),
    user = userEvent.setup({ applyAccept: false });
  render(<CompanyLogo id="" request={request} onChange={onChange} />, {
    wrapper: LocaleProvider,
  });
  const input = screen.getByLabelText("Upload logo");
  await user.upload(
    input,
    new File(["<svg/>"], "unsafe.svg", { type: "image/svg+xml" }),
  );
  expect(request).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("PNG, JPEG or WebP");
  await user.upload(
    input,
    new File(["fixture-bytes"], "logo.png", { type: "image/png" }),
  );
  await waitFor(() => expect(onChange).toHaveBeenCalledWith("logo-one"));
  expect(request).toHaveBeenCalledWith(
    "/api/settings/company-logo",
    expect.any(FormData),
  );
});

it("previews a channel main-language override when a requested translation is missing in both scopes", () => {
  render(
    <LocaleProvider>
      <ContentLanguage
        locales={["es-ES", "it-IT"]}
        mainLocale="es-ES"
        language="it-IT"
      >
        <CompanyTranslations
          data={{ brandName: { "es-ES": "Canal" } }}
          base={{ brandName: { "es-ES": "Base" } }}
          channel
          onChange={vi.fn()}
        />
      </ContentLanguage>
    </LocaleProvider>,
  );
  expect(screen.getByLabelText("Storefront brand name")).toHaveAttribute(
    "placeholder",
    "Canal",
  );
});

it("gives company country and region pickers one exact accessible name", async () => {
  render(<MasterDataSettings request={api()} canWrite />, {
    wrapper: LocaleProvider,
  });
  await screen.findByDisplayValue("Synthetic GmbH");
  expect(screen.getByRole("combobox", { name: "Country" })).toBeVisible();
  expect(
    screen.getByRole("combobox", { name: "State / region" }),
  ).toBeVisible();
});

it("uses the latest draft callback after an asynchronous upload", async () => {
  let finish: (v: any) => void = () => {};
  const request = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = vi.fn(),
    latest = vi.fn(),
    user = userEvent.setup();
  const view = (change: any) => (
    <LocaleProvider>
      <CompanyLogo id="" request={request} onChange={change} />
    </LocaleProvider>
  );
  const { rerender } = render(view(first));
  await user.upload(
    screen.getByLabelText("Upload logo"),
    new File(["bytes"], "logo.png", { type: "image/png" }),
  );
  rerender(view(latest));
  finish({ id: "logo-after-edit" });
  await waitFor(() => expect(latest).toHaveBeenCalledWith("logo-after-edit"));
  expect(first).not.toHaveBeenCalled();
});
