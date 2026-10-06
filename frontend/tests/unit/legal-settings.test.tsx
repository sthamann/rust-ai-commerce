/** Actual legal settings editing: default-channel basis, revisions, sparse translations and read-only enforcement. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import LegalSettings from "../../src/admin/legal/LegalSettings";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { defaultLegal } from "../../src/shared/legal/legal-types";
function transport() {
  const base = {
    mainLocale: "es-ES",
    locales: ["es-ES", "en-GB", "de-DE"],
    legal: {
      ...defaultLegal(),
      documents: { privacy: { "es-ES": "Texto base" } },
    },
  };
  return vi.fn(async (path: string, body?: unknown, method?: string) => {
    if (path === "/store-api/countries")
      return { countries: [], mainLocale: "es-ES", locales: base.locales };
    if (path === "/api/automation")
      return { channels: [{ id: "default", data: { name: { en: "Main" } } }] };
    if (method === "PUT") return { revision: 3 };
    return { data: structuredClone(base), revision: 2 };
  });
}
it("default channel edits the shared basis and saves the acknowledged revision", async () => {
  const request = transport();
  render(
    <LegalSettings request={request} canWrite initialChannel="default" />,
    { wrapper: LocaleProvider },
  );
  const strict = await screen.findByRole("checkbox", {
    name: "Enforce reviewed checkout requirements",
  });
  expect(
    request.mock.calls.some(([p]) => p.endsWith("/channels/default")),
  ).toBe(false);
  fireEvent.click(strict);
  fireEvent.click(
    screen.getByRole("button", { name: "Save changes", exact: true }),
  );
  await waitFor(() =>
    expect(
      request.mock.calls.some(
        ([p, b, m]) =>
          p === "/api/merchant/commerce" &&
          m === "PUT" &&
          (b as { revision: number }).revision === 2,
      ),
    ).toBe(true),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeDisabled(),
  );
});
it("uses one selected language and preserves inherited text without fabricating a translation", async () => {
  const request = transport();
  render(<LegalSettings request={request} canWrite />, {
    wrapper: LocaleProvider,
  });
  await screen.findByRole("button", { name: "Legal documents", exact: true });
  fireEvent.click(
    screen.getByRole("button", { name: "Legal documents", exact: true }),
  );
  fireEvent.change(
    screen.getByRole("combobox", { name: "Content language", exact: true }),
    { target: { value: "en-GB" } },
  );
  const field = screen.getByRole("textbox", {
    name: "Privacy policy",
    exact: true,
  });
  expect(field).toHaveValue("");
  expect(field).toHaveAttribute("placeholder", "Texto base");
  expect(
    screen.getAllByRole("textbox", { name: "Privacy policy", exact: true }),
  ).toHaveLength(1);
});
it("read-only settings cannot enable strict checkout or edit documents", async () => {
  render(<LegalSettings request={transport()} canWrite={false} />, {
    wrapper: LocaleProvider,
  });
  expect(
    await screen.findByRole("checkbox", {
      name: "Enforce reviewed checkout requirements",
    }),
  ).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Save changes", exact: true }),
  ).not.toBeInTheDocument();
});
