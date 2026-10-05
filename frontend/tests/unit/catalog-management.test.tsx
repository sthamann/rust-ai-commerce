/** Catalog regressions exercise actual list/detail components and the safe public description renderer. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import ProductDataView from "../../src/admin/catalog/ProductDataView";
import ProductEditor from "../../src/admin/catalog/ProductEditor";
import RichDescription from "../../src/shared/content/RichDescription";
import { editorDocument } from "../../src/admin/catalog/rich-conversion";
import { newDraft } from "../../src/admin/catalog/catalog-model";
import { orderedCategories } from "../../src/admin/catalog/CategoriesWorkspace";
vi.mock("../../src/shared/apps/AppSurfaces", async (original) => ({
  ...(await original<typeof import("../../src/shared/apps/AppSurfaces")>()),
  AppSurfaceSlot: () => null,
}));
const row = {
  id: "p1",
  name: "Oak chair",
  category: "furniture",
  active: true,
  price: 39.9,
  stock: 3,
  productNumber: "OAK-1",
  variantCount: 2,
  media: [],
};
it("searches and filters through the server instead of hiding the current page", async () => {
  const user = userEvent.setup();
  const request = vi.fn(async (path: string) =>
    path === "/api/merchant/categories"
      ? { elements: [] }
      : { elements: path.includes("absent") ? [] : [row], nextCursor: null },
  );
  render(
    <LocaleProvider>
      <ProductDataView request={request} />
    </LocaleProvider>,
  );
  expect(
    await screen.findByRole("button", { name: /Oak chair/ }),
  ).toBeVisible();
  await user.type(screen.getByRole("searchbox"), "absent");
  expect(
    await screen.findByText("No products match these filters."),
  ).toBeVisible();
  expect(request).toHaveBeenCalledWith(
    expect.stringContaining("search=absent"),
  );
  await user.selectOptions(screen.getByLabelText("Status"), "inactive");
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("active=false"),
    ),
  );
});
it("creates a revision-zero aggregate without fabricating translations", async () => {
  const user = userEvent.setup();
  const request = vi.fn(async () => ({ id: "created", revision: 1 }));
  const created = vi.fn();
  render(
    <LocaleProvider>
      <ProductEditor
        id=""
        request={request}
        categories={[]}
        onBack={vi.fn()}
        onCreated={created}
      />
    </LocaleProvider>,
  );
  await user.type(screen.getByLabelText("Name"), "New object");
  await user.type(screen.getByLabelText("Product number"), "NEW-1");
  await user.click(screen.getByRole("tab", { name: "Prices & stock" }));
  await user.clear(screen.getByLabelText("Price"));
  await user.type(screen.getByLabelText("Price"), "29.95");
  await user.click(screen.getByRole("button", { name: "Save product" }));
  await waitFor(() => expect(created).toHaveBeenCalledWith("created"));
  const [path, payload, method] = request.mock.calls.find(
    (args: any) => args[2] === "POST",
  ) as any;
  expect(path).toBe("/api/merchant/products");
  expect(method).toBe("POST");
  expect(payload.revision).toBe(0);
  expect(payload.commerce.price).toBe(29.95);
  expect(payload.translations.de.name).toBeNull();
  expect(payload.catalog.active).toBe(false);
  expect(payload).not.toHaveProperty("id");
});
it("retains dirty edits after a conflict and requires an explicit discard when leaving", async () => {
  const user = userEvent.setup();
  const d = newDraft();
  d.id = "p1";
  d.revision = 4;
  d.catalog.productNumber = "OAK-1";
  Object.values(d.translations).forEach((t) => (t.name = "Oak chair"));
  const back = vi.fn();
  const request = vi.fn(async (_p: string, _b?: unknown, method?: string) => {
    if (method === "PUT") throw new Error("Product changed");
    return d;
  });
  render(
    <LocaleProvider>
      <ProductEditor
        id="p1"
        request={request}
        categories={[]}
        onBack={back}
        onCreated={vi.fn()}
      />
    </LocaleProvider>,
  );
  await screen.findByDisplayValue("Oak chair");
  await user.type(screen.getByLabelText("Name"), " edited");
  await user.click(screen.getByRole("button", { name: "Save product" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Product changed");
  expect(screen.getByLabelText("Name")).toHaveValue("Oak chair edited");
  await user.click(screen.getByRole("button", { name: /^← Back$/ }));
  expect(back).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(back).toHaveBeenCalledOnce();
});
it("preserves legacy emphasis and renders formatted editor documents without executing unknown nodes or URLs", () => {
  const doc = editorDocument([
    { type: "paragraph", text: "**Strong** and *soft*" },
    { type: "image", url: "https://example.test/image.jpg", text: "Caption" },
  ]);
  const { container } = render(
    <RichDescription
      blocks={[
        { type: "document", doc },
        { type: "document", doc: { type: "script", text: "bad" } },
        {
          type: "document",
          doc: { type: "image", attrs: { src: "javascript:alert(1)" } },
        },
      ]}
    />,
  );
  expect(container.querySelector("strong")).toHaveTextContent("Strong");
  expect(container.querySelector("em")).toHaveTextContent("soft");
  expect(container.querySelectorAll("img")).toHaveLength(1);
  expect(container.querySelector("script")).toBeNull();
});
it("keeps a dirty product draft when the translated transport changes and saves through the current transport", async () => {
  const user = userEvent.setup();
  const d = newDraft();
  d.id = "p1";
  d.revision = 4;
  Object.values(d.translations).forEach((t) => (t.name = "Oak chair"));
  d.catalog.productNumber = "OAK-1";
  const initial = vi.fn(async () => d);
  const translated = vi.fn(async () => ({ id: "p1", revision: 5 }));
  const view = (request: any) => (
    <LocaleProvider>
      <ProductEditor
        id="p1"
        request={request}
        categories={[]}
        onBack={vi.fn()}
        onCreated={vi.fn()}
      />
    </LocaleProvider>
  );
  const { rerender } = render(view(initial));
  await screen.findByDisplayValue("Oak chair");
  await user.type(screen.getByLabelText("Name"), " edited");
  rerender(view(translated));
  expect(screen.getByLabelText("Name")).toHaveValue("Oak chair edited");
  expect(translated).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Save product" }));
  await waitFor(() =>
    expect(translated).toHaveBeenCalledWith(
      "/api/merchant/products/p1",
      expect.objectContaining({
        revision: 4,
        translations: expect.objectContaining({
          en: expect.objectContaining({ name: "Oak chair edited" }),
        }),
      }),
      "PUT",
    ),
  );
});
it("orders category parents before children independent of server row order", () => {
  const categories = [
    { id: "b", parentId: "a", position: 0 },
    { id: "a", parentId: null, position: 1 },
    { id: "c", parentId: null, position: 0 },
  ] as any;
  expect(
    orderedCategories(categories).map((c) => [c.category.id, c.depth]),
  ).toEqual([
    ["c", 0],
    ["a", 0],
    ["b", 1],
  ]);
});
