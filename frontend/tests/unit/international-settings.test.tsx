/** Real component regressions: country search/groups, inheritance and a shared settings draft across areas. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { useState } from "react";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import CountryPicker from "../../src/shared/geography/CountryPicker";
import TranslationFields from "../../src/shared/geography/TranslationFields";
import SettingsWorkspace from "../../src/admin/settings/SettingsWorkspace";
import {
  inheritedText,
  type Country,
  type TextMap,
} from "../../src/shared/geography/geography-types";
import settings from "../../../fixtures/demo-settings.json";
const world: Country[] = [
  {
    code: "DE",
    alpha3: "DEU",
    numeric: "276",
    isoAssigned: true,
    continent: "EU",
    name: { en: "Germany", de: "Deutschland", es: "Alemania" },
    states: [],
  },
  {
    code: "ES",
    alpha3: "ESP",
    numeric: "724",
    isoAssigned: true,
    continent: "EU",
    name: { en: "Spain", de: "Spanien", es: "España" },
    states: [],
  },
  {
    code: "US",
    alpha3: "USA",
    numeric: "840",
    isoAssigned: true,
    continent: "NA",
    name: {
      en: "United States",
      de: "Vereinigte Staaten",
      es: "Estados Unidos",
    },
    states: [
      {
        code: "US-CA",
        name: { en: "California", de: "Kalifornien", es: "California" },
      },
    ],
  },
];
it("searches ISO aliases and names in other languages, selects continent groups and supports keyboard selection without country checkboxes", async () => {
  const change = vi.fn();
  render(
    <CountryPicker
      countries={world}
      value={[]}
      onChange={change}
      label="Delivery countries"
    />,
    { wrapper: LocaleProvider },
  );
  const user = userEvent.setup(),
    input = screen.getByRole("combobox");
  await user.click(input);
  await user.click(screen.getAllByRole("button", { name: "Select group" })[0]);
  expect(change).toHaveBeenLastCalledWith(["DE", "ES"]);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  await user.type(input, "Alemania");
  expect(screen.getByRole("option")).toHaveTextContent("Germany");
  await user.keyboard("{Enter}");
  expect(change).toHaveBeenLastCalledWith(["DE"]);
  await user.clear(input);
  await user.type(input, "USA");
  await user.keyboard("{Enter}");
  expect(change).toHaveBeenLastCalledWith(["US"]);
  await user.keyboard("{Escape}");
  expect(input).toHaveAttribute("aria-expanded", "false");
});
it("shows main-language placeholders without copying them, overrides one field and restores inheritance explicitly", async () => {
  let last: TextMap = {
    es: { name: "Entrega", description: "Descripción" },
    de: { name: null, description: null },
  };
  function Harness() {
    const [v, setV] = useState(last);
    return (
      <TranslationFields
        value={v}
        onChange={(next) => {
          last = next;
          setV(next);
        }}
        locales={["es-ES", "de-DE"]}
        mainLocale="es-ES"
      />
    );
  }
  render(<Harness />, { wrapper: LocaleProvider });
  const user = userEvent.setup();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Content language" }),
    "de-DE",
  );
  const name = screen.getByLabelText("Name");
  expect(name).toHaveValue("");
  expect(name).toHaveAttribute("placeholder", "Entrega");
  await user.type(name, "Versand");
  expect(last.de.name).toBe("Versand");
  expect(last.de.description).toBeNull();
  await user.click(screen.getByRole("button", { name: /Own translation/ }));
  expect(last.de.name).toBeNull();
  expect(inheritedText(last, "de-DE", "es-ES", "name")).toBe("Entrega");
});
it("keeps one international draft while configuring countries, taxes and shipping, then saves a complete scoped aggregate", async () => {
  const calls: any[] = [];
  const request = vi.fn(async (path: string, body?: any, method?: string) => {
    calls.push([path, body, method]);
    if (path === "/api/settings/master-data")
      return {
        revision: 1,
        data: {
          name: "Fixture",
          address: "Fixture",
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
    if (path === "/store-api/countries") return { countries: world };
    if (path === "/api/merchant/commerce" && method !== "PUT")
      return { revision: 7, data: structuredClone(settings) };
    if (method === "PUT") return { revision: 8 };
    if (path === "/api/automation") return { rules: [] };
    return { jobs: [], providers: [] };
  });
  render(
    <SettingsWorkspace
      request={request}
      rights={["settings.write"]}
      onConnections={vi.fn()}
      onTeam={vi.fn()}
      onAutomation={vi.fn()}
    />,
    { wrapper: LocaleProvider },
  );
  const user = userEvent.setup();
  await screen.findByLabelText("Name", { exact: true });
  await user.click(screen.getByRole("button", { name: /^Languages/ }));
  const localeInput = screen.getByLabelText("Add locale (e.g. it-IT)");
  await user.type(localeInput, "en-12");
  expect(screen.getByRole("button", { name: "+ Add" })).toBeDisabled();
  await user.clear(localeInput);
  await user.type(localeInput, "it-it");
  await user.click(screen.getByRole("button", { name: "+ Add" }));
  expect(
    screen.getByText("it-IT", { exact: true, selector: "small" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Countries/ }));
  const input = await screen.findByRole("combobox", {
    name: "Delivery countries",
  });
  await user.type(input, "USA");
  await user.keyboard("{Enter}{Escape}");
  await user.click(
    screen.getByRole("button", { name: /Tax classes|Tax management/ }),
  );
  await user.type(screen.getByLabelText("Fallback rate (%)"), "19");
  await user.click(screen.getByRole("button", { name: /^Shipping/ }));
  expect(
    screen.queryByText(/This page has unsaved changes/),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Countries/ }));
  expect(
    screen.getByRole("combobox", { name: "Delivery countries" }).parentElement,
  ).toHaveTextContent("United States");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(calls.some((c) => c[2] === "PUT")).toBe(true));
  const payload = calls.find((c) => c[2] === "PUT")[1];
  expect(payload.revision).toBe(7);
  expect(payload.data.countries).toContain("US");
  expect(payload.data.taxes[0].defaultRate).toBe(19);
  expect(payload.data.locales).toContain("it-IT");
});
