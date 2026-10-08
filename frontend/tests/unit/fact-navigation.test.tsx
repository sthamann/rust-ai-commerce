/** Saved category predicates reuse one translated field, inheritance and native category state. */
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { ContentLanguage } from "../../src/shared/i18n/ContentLanguage";
import ContentLanguagePicker from "../../src/shared/i18n/ContentLanguagePicker";
import CategoryFactQuery from "../../src/admin/catalog/CategoryFactQuery";
import type { Category } from "../../src/admin/catalog/catalog-model";
it("preserves source-language query, edits a fifth language and restores inheritance in a single field", async () => {
  let latest: Category["data"]["graphQuery"] = {
    nodeType: "intent",
    minimumConfidence: 0.8,
    text: { "en-GB": "cycling", "de-DE": "Radfahren" },
  };
  function Harness() {
    const [value, set] = useState(latest);
    return (
      <ContentLanguage locales={["en-GB", "de-DE", "it-IT"]} mainLocale="en-GB">
        <ContentLanguagePicker />
        <CategoryFactQuery
          value={value}
          onChange={(v) => {
            latest = v;
            set(v);
          }}
        />
      </ContentLanguage>
    );
  }
  render(<Harness />, { wrapper: LocaleProvider });
  const user = userEvent.setup();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Content language" }),
    "it-IT",
  );
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(screen.getByLabelText("Fact phrase")).toHaveAttribute(
    "placeholder",
    "cycling",
  );
  await user.type(screen.getByLabelText("Fact phrase"), "ciclismo");
  expect(latest?.text).toEqual({
    "en-GB": "cycling",
    "de-DE": "Radfahren",
    "it-IT": "ciclismo",
  });
  await user.click(screen.getByRole("button", { name: /Own translation/ }));
  expect(latest?.text["it-IT"]).toBeUndefined();
  await user.selectOptions(screen.getByLabelText("Fact type"), "material");
  expect(latest?.nodeType).toBe("material");
  await user.click(screen.getByRole("checkbox"));
  expect(latest).toBeNull();
  await user.click(screen.getByRole("checkbox"));
  expect(latest?.text).toEqual({ "en-GB": "" });
});
