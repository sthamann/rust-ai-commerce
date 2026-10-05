/** Real shared fields and graphical flow nodes: dynamic languages, preservation, inheritance, empty text and independent regional variants. */
import { useState } from "react";
import {
  render,
  screen,
  within,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { ContentLanguage } from "../../src/shared/i18n/ContentLanguage";
import ContentLanguagePicker from "../../src/shared/i18n/ContentLanguagePicker";
import LocalizedField from "../../src/shared/i18n/LocalizedField";
import {
  contentKey,
  type LocalizedText,
} from "../../src/shared/i18n/content-language";
import FlowCanvas from "../../src/admin/automation/FlowCanvas";
import ProductAssets from "../../src/admin/catalog/ProductAssets";
const languages = ["es-ES", "de-DE", "it-IT"];
it("edits one graphical flow instruction in the selected language, preserves other translations and restores Spanish inheritance", async () => {
  let latest: any = {
    entry: "first",
    nodes: [
      {
        id: "first",
        kind: "action",
        action: "note",
        config: { instruction: { es: "Mensaje principal", de: "Notiz" } },
        next: null,
      },
    ],
  };
  function Harness() {
    const [pipeline, set] = useState(latest);
    return (
      <ContentLanguage locales={languages} mainLocale="es-ES">
        <ContentLanguagePicker />
        <FlowCanvas
          value={pipeline}
          onChange={(v) => {
            latest = v;
            set(v);
          }}
          catalog={{ conditions: [], events: [], apps: [], fields: [] }}
        />
      </ContentLanguage>
    );
  }
  render(<Harness />, { wrapper: LocaleProvider });
  const user = userEvent.setup();
  const picker = screen.getByRole("combobox", { name: "Content language" });
  await user.selectOptions(picker, "de-DE");
  const text = screen.getByRole("textbox", { name: "Message / instruction" });
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(text).toHaveValue("Notiz");
  await user.type(text, " neu");
  await user.selectOptions(picker, "it-IT");
  expect(text).toHaveValue("");
  expect(text).toHaveAttribute("placeholder", "Mensaje principal");
  expect(latest.nodes[0].config.instruction).toEqual({
    es: "Mensaje principal",
    de: "Notiz neu",
  });
  await user.type(text, "Italiano");
  await user.selectOptions(picker, "de-DE");
  expect(text).toHaveValue("Notiz neu");
  await user.click(screen.getByRole("button", { name: /Own translation/ }));
  expect(latest.nodes[0].config.instruction).toEqual({
    es: "Mensaje principal",
    "it-IT": "Italiano",
  });
  expect(text).toHaveAttribute("placeholder", "Mensaje principal");
});
it("keeps explicitly blank descriptions, supports keyboard language selection and never copies fallbacks on navigation", async () => {
  let latest: LocalizedText = { es: "Principal", de: "" };
  function Harness() {
    const [map, set] = useState(latest);
    return (
      <ContentLanguage locales={languages} mainLocale="es-ES">
        <ContentLanguagePicker />
        <LocalizedField
          label="Description"
          value={map}
          multiline
          onChange={(next) => {
            latest = next;
            set(next);
          }}
        />
      </ContentLanguage>
    );
  }
  render(<Harness />, { wrapper: LocaleProvider });
  const user = userEvent.setup(),
    picker = screen.getByRole("combobox");
  await user.selectOptions(picker, "de-DE");
  expect(screen.getByLabelText("Description")).not.toHaveAttribute(
    "placeholder",
  );
  await user.selectOptions(picker, "it-IT");
  expect(screen.getByLabelText("Description")).toHaveAttribute(
    "placeholder",
    "Principal",
  );
  expect(latest).toEqual({ es: "Principal", de: "" });
});
it("keeps regional editions independent and migrates only an unambiguous legacy base-language key", () => {
  const map = { en: "Legacy", "en-US": "USA" };
  expect(contentKey(map, "en-GB", ["en-GB", "en-US"])).toBe("en-GB");
  expect(contentKey(map, "en-GB", ["en-GB", "es-ES"])).toBe("en");
  expect(contentKey(map, "en-US", ["en-GB", "en-US"])).toBe("en-US");
});
it("uploads a product attachment with one Spanish title and keeps all other enabled languages inherited", async () => {
  const request = vi.fn(async (_path: string, body?: unknown) =>
    body ? { id: "asset" } : { elements: [] },
  );
  render(
    <ContentLanguage locales={languages} mainLocale="es-ES" language="es-ES">
      <ProductAssets id="mug" request={request} />
    </ContentLanguage>,
    { wrapper: LocaleProvider },
  );
  const user = userEvent.setup();
  const form = screen
    .getByRole("button", { name: "Upload file" })
    .closest("form")!;
  const controls = within(form);
  expect(controls.getAllByRole("textbox")).toHaveLength(1);
  await user.type(controls.getByLabelText("Name"), "Ficha técnica");
  const file = form.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(
    file,
    new File(["Synthetic fixture"], "fixture.txt", { type: "text/plain" }),
  );
  await user.click(controls.getByRole("button", { name: "Upload file" }));
  fireEvent.submit(form);
  await waitFor(() =>
    expect(request.mock.calls.some((c) => c[1] instanceof FormData)).toBe(true),
  );
  const upload = request.mock.calls.find((c) => c[1] instanceof FormData)!;
  expect(JSON.parse((upload[1] as FormData).get("title") as string)).toEqual({
    "es-ES": "Ficha técnica",
  });
});
it("restores main-language inheritance when legacy and canonical keys coexist", async () => {
  let latest: LocalizedText = {
    es: "Principal",
    de: "Legacy text",
    "de-DE": "Regional text",
    "it-IT": "Italiano",
  };
  function Harness() {
    const [map, set] = useState(latest);
    return (
      <ContentLanguage
        locales={[...languages, "de"]}
        mainLocale="es-ES"
        language="de-DE"
      >
        <LocalizedField
          label="Description"
          value={map}
          onChange={(next) => {
            latest = next;
            set(next);
          }}
        />
      </ContentLanguage>
    );
  }
  render(<Harness />, { wrapper: LocaleProvider });
  expect(screen.getByLabelText("Description")).toHaveValue("Regional text");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /Own translation/ }));
  expect(latest).toEqual({ es: "Principal", "it-IT": "Italiano" });
  expect(screen.getByLabelText("Description")).toHaveValue("");
  expect(screen.getByLabelText("Description")).toHaveAttribute(
    "placeholder",
    "Principal",
  );
});
