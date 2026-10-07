/** Real released app surfaces render selected shopper content languages separately from the interface locale. */
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import NativeAppView from "../../src/shared/apps/native/NativeAppView";
import AppSlot from "../../src/shared/apps/AppSlot";
it("renders Italian native app content with Spanish shop inheritance and English interface controls", async () => {
  history.replaceState(null, "", "/?shop=unit-shop&language=it-IT");
  render(
    <NativeAppView
      app="guides"
      public
      mainLocale="es-ES"
      locales={["es-ES", "it-IT"]}
      allowedActions={["read"]}
      request={async () => ({
        elements: [
          { id: "one", revision: 1, title: { es: "Manual principal" } },
        ],
        nextCursor: null,
      })}
      native={{
        view: {
          id: "v",
          layout: "stack",
          blocks: [
            {
              id: "b",
              kind: "table",
              title: { it: "Consigli" },
              entity: "guides",
              readAction: "read",
            },
          ],
        },
        entities: [
          {
            name: "guides",
            label: { es: "Guías" },
            publicRead: true,
            fields: [
              {
                name: "title",
                label: { it: "Titolo" },
                kind: "string",
                translatable: true,
              },
            ],
          },
        ],
      }}
    />,
    { wrapper: LocaleProvider },
  );
  expect(screen.getByText("Consigli")).toBeVisible();
  expect(await screen.findByText("Manual principal")).toBeVisible();
  expect(screen.getByRole("columnheader", { name: "Titolo" })).toBeVisible();
});

it("uses the shop main language for legacy product slots and retains intentional blank hints", async () => {
  history.replaceState(null, "", "/?shop=unit-shop&language=de-DE");
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    const value = url.includes("countries")
      ? { countries: [], mainLocale: "es-ES", locales: ["es-ES", "de-DE"] }
      : {
          slots: [
            {
              app: "care",
              version: "1",
              slot: { component: "product-configuration" },
              configuration: {
                inputField: "text",
                label: { es: "Consejo", en: "English" },
                hint: { de: "", es: "Herencia" },
              },
            },
          ],
        };
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  render(<AppSlot productId="one" onCart={() => {}} />, {
    wrapper: LocaleProvider,
  });
  expect(await screen.findByRole("heading", { name: "Consejo" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Consejo" })).toBeVisible();
  expect(screen.queryByText("Herencia")).not.toBeInTheDocument();
});
