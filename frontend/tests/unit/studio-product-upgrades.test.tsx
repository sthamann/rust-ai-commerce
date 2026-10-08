/** Real editor and variant workflow regressions: structured Markdown, inheritance and partial batch failure. */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import RichEditor from "../../src/shared/content/editor/RichEditor";
import ProductEditor from "../../src/admin/catalog/ProductEditor";
import ProductVariants from "../../src/admin/catalog/ProductVariants";
import VariantGenerator from "../../src/admin/catalog/VariantGenerator";
import { newDraft } from "../../src/admin/catalog/catalog-model";
import {
  variantCombinations,
  variantPayload,
} from "../../src/admin/catalog/variant-model";
import {
  markdownCompatible,
  safeMarkdownDocument,
} from "../../src/shared/content/editor/markdown-content";
it("switches visual content to Markdown, applies structured formatting and previews the same document", async () => {
  const change = vi.fn(),
    user = userEvent.setup();
  render(
    <LocaleProvider>
      <RichEditor
        value={{}}
        fallback="Existing description"
        language="en"
        onChange={change}
      />
    </LocaleProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Markdown" }));
  const source = screen.getByLabelText("Markdown source");
  expect(source).toHaveValue("Existing description");
  fireEvent.change(source, {
    target: { value: "## Care\n\n**Wash gently**\n\n- No dryer" },
  });
  expect(change).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Apply Markdown" }));
  expect(change.mock.lastCall![0].en[0].doc.content[0].type).toBe("heading");
  await user.click(screen.getByRole("button", { name: "Visual editor" }));
  await user.click(screen.getByRole("button", { name: "Preview" }));
  expect(screen.getByRole("heading", { name: "Care" })).toBeVisible();
  expect(screen.getByText("Wash gently").closest("strong")).toBeTruthy();
});
it("keeps rich-only content in the visual editor and rejects unsafe Markdown document links", async () => {
  const doc = {
    type: "doc",
    content: [
      { type: "video", attrs: { src: "https://example.test/movie.mp4" } },
    ],
  };
  expect(markdownCompatible(doc)).toBe(false);
  expect(
    safeMarkdownDocument({
      type: "image",
      attrs: { src: "javascript:alert(1)" },
    }),
  ).toBe(false);
  expect(
    safeMarkdownDocument({
      type: "text",
      marks: [
        { type: "link", attrs: { href: "https://user:pass@example.test" } },
      ],
    }),
  ).toBe(false);
  render(
    <LocaleProvider>
      <RichEditor
        value={{ en: [{ type: "document", doc }] }}
        language="en"
        onChange={vi.fn()}
      />
    </LocaleProvider>,
  );
  expect(
    await screen.findByRole("button", { name: "Markdown" }),
  ).toBeDisabled();
});
it("bounds combinations, deduplicates values and preserves missing translations in child payloads", () => {
  const parent = {
    ...newDraft(),
    id: "parent",
    channels: [],
    catalog: { ...newDraft().catalog, productNumber: "SKU" },
  };
  const rows = variantCombinations(
    [
      { name: "Size", values: "S, M, S" },
      { name: "Color", values: "Blue, Red" },
    ],
    parent,
  );
  expect(rows).toHaveLength(4);
  const child = variantPayload(parent, rows[0]);
  expect(child.catalog.parentId).toBe("parent");
  expect(child).not.toHaveProperty("mainLocale");
  expect(child.translations.de.name).toBeNull();
  expect(() =>
    variantCombinations(
      [
        {
          name: "A",
          values: Array.from({ length: 51 }, (_, i) => String(i)).join(","),
        },
      ],
      parent,
    ),
  ).toThrow();
  expect(() =>
    variantCombinations(
      [
        { name: "Size", values: "S" },
        { name: " Size ", values: "M" },
      ],
      parent,
    ),
  ).toThrow();
});
it("creates reviewed variants from the saved parent and retains successes for retry", async () => {
  const user = userEvent.setup(),
    parent = { ...newDraft(), id: "parent" };
  parent.catalog.productNumber = "SKU";
  let fail = true;
  const request = vi.fn(async (_path: string, body?: any) => {
    if (_path.includes("parentId=")) return { elements: [], nextCursor: null };
    if (!body)
      return {
        ...parent,
        commerce: { ...parent.commerce, properties: { saved: "yes" } },
      };
    if (body.catalog.productNumber === "SKU-2" && fail) throw Error("Conflict");
    return { id: body.catalog.productNumber };
  });
  render(
    <LocaleProvider>
      <VariantGenerator
        parent={parent}
        request={request}
        onCreated={vi.fn(async () => {})}
      />
    </LocaleProvider>,
  );
  await user.type(screen.getByLabelText("Option group"), "Size");
  await user.type(screen.getByLabelText("Values, separated by commas"), "S,M");
  await user.click(
    screen.getByRole("button", { name: "Generate combinations" }),
  );
  await user.click(
    screen.getByRole("button", { name: /Create selected variants/ }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Conflict");
  expect(
    request.mock.calls.filter((c) => c[1]?.catalog?.productNumber === "SKU-1"),
  ).toHaveLength(1);
  fail = false;
  await user.click(
    screen.getByRole("button", { name: /Create selected variants/ }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /Create selected variants/ }),
    ).toBeDisabled(),
  );
  expect(
    request.mock.calls.filter((c) => c[1]?.catalog?.productNumber === "SKU-1"),
  ).toHaveLength(1);
  expect(
    request.mock.calls.find((c) => c[1]?.catalog)?.[1].commerce.properties,
  ).toEqual({ saved: "yes" });
});
it("opens the child editor with explicit action and follows variant cursors", async () => {
  const parent = { ...newDraft(), id: "parent" },
    open = vi.fn(),
    user = userEvent.setup();
  const request = vi.fn(async (path: string) => ({
    elements: [
      {
        id: path.includes("after=") ? "second" : "first",
        options: { size: "M" },
        productNumber: "SKU",
        stock: 1,
        price: 2,
      },
    ],
    nextCursor: path.includes("after=") ? null : "cursor",
  }));
  render(
    <LocaleProvider>
      <ProductVariants
        draft={parent}
        request={request}
        onOpen={open}
        onChange={vi.fn()}
      />
    </LocaleProvider>,
  );
  await user.click(
    await screen.findByRole("button", { name: /Load more variants/ }),
  );
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: /Edit variant/ }),
    ).toHaveLength(2),
  );
  await user.click(screen.getAllByRole("button", { name: /Edit variant/ })[1]);
  expect(open).toHaveBeenCalledWith("second");
});
it("serializes numbered lists and links without editor-only null attributes", async () => {
  const change = vi.fn(),
    user = userEvent.setup();
  render(
    <LocaleProvider>
      <RichEditor value={{}} language="en" onChange={change} />
    </LocaleProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Markdown" }));
  fireEvent.change(screen.getByLabelText("Markdown source"), {
    target: {
      value:
        "## Heading\n\n1. First\n2. Second\n\n> Quote\n\n```rust\nlet x = 1;\n```\n\n[Guide](https://example.test/guide)\n\n![Oak](https://example.test/oak.png)\n\n---",
    },
  });
  await user.click(screen.getByRole("button", { name: "Apply Markdown" }));
  const doc = change.mock.lastCall![0].en[0].doc;
  expect(doc.content[1].attrs).toEqual({ start: 1 });
  expect(doc.content[4].content[0].marks[0].attrs).not.toHaveProperty("title");
  expect(safeMarkdownDocument(doc)).toBe(true);
});
it("guards the actual aggregate save and tabs while Markdown source is pending", async () => {
  const user = userEvent.setup(),
    draft = { ...newDraft(), id: "parent", revision: 1 };
  draft.catalog.productNumber = "SKU";
  draft.translations.en.name = "Chair";
  const request = vi.fn(async () => draft);
  render(
    <LocaleProvider>
      <ProductEditor
        id="parent"
        request={request}
        categories={[]}
        onBack={vi.fn()}
        onCreated={vi.fn()}
      />
    </LocaleProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Markdown" }));
  fireEvent.change(screen.getByLabelText("Markdown source"), {
    target: { value: "## Draft\n\nReview first" },
  });
  expect(screen.getByRole("button", { name: "Save product" })).toBeDisabled();
  await user.click(screen.getByRole("tab", { name: "Variants" }));
  expect(screen.getByLabelText("Markdown source")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Apply Markdown" }));
  expect(screen.getByRole("button", { name: "Save product" })).toBeEnabled();
});
it("recognizes existing combinations before creating and avoids existing SKU defaults", async () => {
  const user = userEvent.setup(),
    parent = { ...newDraft(), id: "parent" };
  parent.catalog.productNumber = "SKU";
  const request = vi.fn(async () => ({
    elements: [
      {
        id: "blue",
        options: { Color: "Blue" },
        productNumber: "SKU-1",
        price: 9,
        stock: 3,
      },
    ],
    nextCursor: null,
  }));
  render(
    <LocaleProvider>
      <VariantGenerator
        parent={parent}
        request={request}
        onCreated={vi.fn(async () => {})}
      />
    </LocaleProvider>,
  );
  await user.type(screen.getByLabelText("Option group"), "Color");
  await user.type(
    screen.getByLabelText("Values, separated by commas"),
    "Blue,Red",
  );
  await user.click(
    screen.getByRole("button", { name: "Generate combinations" }),
  );
  expect(await screen.findByText("Already exists")).toBeVisible();
  expect(screen.getByLabelText("Product number 2")).toHaveValue("SKU-2");
  expect(
    screen.getByRole("button", { name: /Create selected variants/ }),
  ).toHaveTextContent("(1)");
});
