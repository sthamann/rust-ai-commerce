/** Regression checks for structured product inheritance and persistent translation review pagination. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import {
  ProductSeo,
  ProductSpecifications,
} from "../../src/admin/catalog/ProductLocalizedContent";
import {
  newDraft,
  type ProductDraft,
} from "../../src/admin/catalog/catalog-model";
import TranslationJobs from "../../src/admin/settings/TranslationJobs";
import settings from "../../../fixtures/demo-settings.json";
it("inherits SEO per field from Spanish and preserves explicit blanks and independent source fields", async () => {
  let draft = {
    ...newDraft(),
    mainLocale: "es-ES",
    extra: {
      seo: {
        es: { title: "Origen", description: "Descripción", slug: "origen" },
        de: { title: null, description: "" },
      },
    },
  };
  function Harness() {
    const [d, set] = useState<ProductDraft>(draft);
    return (
      <ProductSeo
        draft={d}
        lang="de"
        onChange={(v) => {
          draft = v as typeof draft;
          set(v);
        }}
      />
    );
  }
  render(<Harness />, { wrapper: LocaleProvider });
  const title = screen.getByLabelText(/Meta title/);
  expect(title).toHaveValue("");
  expect(title).toHaveAttribute("placeholder", "Origen");
  const user = userEvent.setup();
  await user.type(title, "Titel");
  expect(draft.extra.seo.es.title).toBe("Origen");
  expect(draft.extra.seo.de.description).toBe("");
  await user.click(
    screen.getAllByRole("button", { name: /Own translation/ })[0],
  );
  expect(draft.extra.seo.de.title).toBeNull();
});
it("does not save specification fallback until a real edit, then resets the group to inheritance", async () => {
  let draft = {
    ...newDraft(),
    mainLocale: "es-ES",
    extra: { specifications: { es: { Material: "Madera" } } },
  };
  function Harness() {
    const [d, set] = useState<ProductDraft>(draft);
    return (
      <ProductSpecifications
        draft={d}
        lang="de"
        onChange={(v) => {
          draft = v as typeof draft;
          set(v);
        }}
      />
    );
  }
  render(<Harness />, { wrapper: LocaleProvider });
  expect(screen.getByDisplayValue("Madera")).toBeVisible();
  expect((draft.extra.specifications as any).de).toBeUndefined();
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Value"));
  await user.type(screen.getByLabelText("Value"), "Holz");
  expect((draft.extra.specifications as any).de.Material).toBe("Holz");
  expect(draft.extra.specifications.es.Material).toBe("Madera");
  await user.click(screen.getByRole("button", { name: /Own translation/ }));
  expect((draft.extra.specifications as any).de).toBeUndefined();
});
it("keeps expanded translation drafts when the progress poll refreshes the job list", async () => {
  const entries = Array.from({ length: 60 }, (_, n) => ({
    product_id: `p${n}`,
    revision: 1,
    status: "ready",
    source: { name: `Source ${n}`, description: "Source" },
    result: { name: `Target ${n}`, description: "Target" },
  }));
  const request = vi.fn(async (path: string) => {
    if (path === "/api/merchant/translations")
      return {
        jobs: [
          {
            id: "job",
            target_locale: "de-DE",
            status: "ready",
            processed: 60,
            total: 60,
          },
        ],
      };
    if (path === "/api/agent/providers") return { providers: [] };
    return {
      items: path.includes("?cursor=")
        ? entries.slice(50)
        : entries.slice(0, 50),
      counts: { ready: 60 },
      nextCursor: path.includes("?cursor=") ? null : "p49",
    };
  });
  render(
    <TranslationJobs request={request} config={settings} disabled={false} />,
    { wrapper: LocaleProvider },
  );
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: /de-DE/ }));
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: "Show more" }));
  await screen.findByText("Target 59");
  await new Promise((resolve) => setTimeout(resolve, 2700));
  expect(screen.getByText("Target 59")).toBeVisible();
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Show more" }),
    ).not.toBeInTheDocument(),
  );
});
