/** Knowledge regressions exercise source permissions, multilingual inheritance, exact review decisions and retrieval privacy. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { KnowledgeView } from "../../src/admin/intelligence/KnowledgeView";
import KnowledgeSources from "../../src/admin/intelligence/KnowledgeSources";
import SourceEditor from "../../src/admin/intelligence/SourceEditor";
import KnowledgeExplorer from "../../src/admin/intelligence/KnowledgeExplorer";
import KnowledgePreview from "../../src/admin/intelligence/KnowledgePreview";
import MemoryView from "../../src/admin/intelligence/MemoryView";
import type {
  Workspace,
  SourceDetail,
} from "../../src/admin/intelligence/knowledge-types";
import type { Product } from "../../src/admin/shell/studio-types";
import { overview } from "./fixtures";
import { knowledgeWords } from "../../src/shared/i18n/knowledge-i18n";
const source: SourceDetail = {
  id: "guide",
  title: "Care guide",
  content: "Handle with care",
  kind: "care",
  locale: "en-GB",
  product_id: "mug",
  visibility: "private",
  archived: false,
  revision: 4,
  content_hash: "fixture-digest",
  source_type: "api",
  created_at: "2026-01-01T12:00:00Z",
  chunkCount: 1,
  indexedChunks: 0,
  translationLocales: [],
  translations: {},
};
const workspace: Workspace = {
  totals: {
    products: 60000,
    sources: 1,
    published: 0,
    external: 0,
    observedPairs: 0,
    approvedSuggestions: 0,
  },
  sources: [source],
  next: null,
  activity: [],
  mainLocale: "en-GB",
  locales: ["en-GB", "de-DE", "es-ES"],
  canWrite: true,
  sampleLimits: { sources: 50 },
};
const products = [{ id: "mug", name: "Fixture mug" }] as Product[];
function wrap(child: React.ReactNode, locale = "en-GB") {
  localStorage.setItem("rac-locale", locale);
  return render(<LocaleProvider>{child}</LocaleProvider>);
}
it("opens coherent workspace with whole-shop counts and useful paths, including sources beyond the old graph", async () => {
  const request = vi.fn(async (path: string) =>
      path.startsWith("/api/knowledge/external") ? { elements: [] } : workspace,
    ),
    onIntent = vi.fn();
  wrap(
    <KnowledgeView
      focus="mug"
      data={{ ...overview, products }}
      request={request}
      onIntent={onIntent}
      onProduct={vi.fn()}
    />,
  );
  expect(await screen.findByText("60,000")).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "From facts to useful decisions" }),
  ).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /^Add knowledge/ }));
  expect(
    await screen.findByRole("heading", { name: "New knowledge source" }),
  ).toBeVisible();
  expect(screen.queryByText("Title · EN")).not.toBeInTheDocument();
});
it("single-language edits retain inheritance and explicit empty translation without fabricating other values", async () => {
  const request = vi.fn(async () => ({})),
    onSaved = vi.fn();
  wrap(
    <SourceEditor
      source={source}
      workspace={workspace}
      request={request}
      onSaved={onSaved}
      onCancel={vi.fn()}
    />,
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Content language" }),
    "de-DE",
  );
  const title = screen.getByRole("textbox", { name: "Title" }),
    body = screen.getByRole("textbox", { name: "Source text" });
  expect(title).toHaveValue("");
  expect(title).toHaveAttribute("placeholder", "Care guide");
  expect(screen.getAllByRole("textbox", { name: "Source text" })).toHaveLength(
    1,
  );
  await userEvent.type(title, "Pflege");
  await userEvent.type(body, "x");
  await userEvent.clear(body);
  await userEvent.click(screen.getByRole("button", { name: "Save source" }));
  expect(request).toHaveBeenCalledWith(
    "/api/knowledge/documents/guide",
    expect.objectContaining({
      revision: 4,
      title: "Care guide",
      translations: { "de-DE": { title: "Pflege", content: "" } },
    }),
    "PATCH",
  );
  expect(onSaved).toHaveBeenCalled();
});
it("non-English primary content language persists as the source basis", async () => {
  const request = vi.fn(async () => ({}));
  wrap(
    <SourceEditor
      workspace={{ ...workspace, mainLocale: "es-ES" }}
      request={request}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
    />,
    "es-ES",
  );
  await userEvent.type(screen.getByRole("textbox", { name: "Título" }), "Guía");
  await userEvent.type(
    screen.getByRole("textbox", { name: "Texto de la fuente" }),
    "Cuidados de cerámica",
  );
  await userEvent.click(screen.getByRole("button", { name: "Guardar fuente" }));
  expect(request).toHaveBeenCalledWith(
    "/api/knowledge/documents",
    expect.objectContaining({
      locale: "es-ES",
      translations: {},
      content: "Cuidados de cerámica",
    }),
    "POST",
  );
});
it("source publication is confirmed once with exact revision and a read-only viewer never sees write controls", async () => {
  const request = vi.fn(async (path: string) =>
    path.endsWith("/guide") ? source : workspace,
  );
  const view = wrap(
    <KnowledgeSources
      workspace={workspace}
      request={request}
      onChange={vi.fn()}
      onCreateDone={vi.fn()}
    />,
  );
  await userEvent.click(
    await screen.findByRole("button", { name: /Care guide/ }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Publish for customers" }),
  );
  expect(request.mock.calls.filter((c) => c.length > 1)).toHaveLength(0);
  expect(screen.getByRole("dialog")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm decision" }),
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/knowledge/documents/guide",
      { revision: 4, approve: true, visibility: "public" },
      "PUT",
    ),
  );
  view.unmount();
  wrap(
    <KnowledgeSources
      workspace={{ ...workspace, canWrite: false }}
      request={request}
      onChange={vi.fn()}
      onCreateDone={vi.fn()}
    />,
  );
  await userEvent.click(
    await screen.findByRole("button", { name: /Care guide/ }),
  );
  expect(
    screen.queryByRole("button", { name: "Publish for customers" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /^Add knowledge/ }),
  ).not.toBeInTheDocument();
});
it("retrieval preview shows exact source text, detects missing evidence and uses the chosen privacy scope", async () => {
  const request = vi.fn(async () => ({
    audience: "customer",
    locale: "en-GB",
    product: null,
    sources: [
      {
        sourceId: "guide:0",
        title: "Care guide",
        text: "Handle with care",
        contentHash: "fixture-digest",
        locale: "en-GB",
      },
    ],
    external: [],
    modelCalled: false,
    sideEffects: false,
  }));
  wrap(
    <KnowledgePreview
      products={products}
      request={request}
      onIntent={vi.fn()}
    />,
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "Question to test" }),
    "Care?",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Inspect available evidence" }),
  );
  expect(await screen.findByText("Handle with care")).toBeVisible();
  expect(request).toHaveBeenCalledWith("/api/knowledge/preview", {
    query: "Care?",
    productId: "mug",
    audience: "customer",
  });
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Use as" }),
    "merchant",
  );
  expect(screen.queryByText("Handle with care")).not.toBeInTheDocument();
  request.mockResolvedValueOnce({
    audience: "merchant",
    locale: "en-GB",
    product: null,
    sources: [],
    external: [],
    modelCalled: false,
    sideEffects: false,
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Inspect available evidence" }),
  );
  expect(
    await screen.findByText(/No matching document passages/),
  ).toBeVisible();
});
it("source API failures preserve edits and surface a recoverable error", async () => {
  const request = vi.fn(async () => {
      throw new Error("Source changed; reload before saving");
    }),
    onSaved = vi.fn();
  wrap(
    <SourceEditor
      source={source}
      workspace={workspace}
      request={request}
      onSaved={onSaved}
      onCancel={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Save source" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Source changed");
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Source text" })).toHaveValue(
    "Handle with care",
  );
});
it("observed pairs separate simulation, keep approved state disabled and require review for recommendation changes", async () => {
  const request = vi.fn(async () => ({
    processedEvents: 4,
    pairs: [
      {
        left: "mug",
        right: "lamp",
        orders: 3,
        simulatedOrders: 2,
        lastEvent: 123,
        updatedAt: "2026-01-01T12:00:00Z",
      },
    ],
    hypotheses: [
      {
        id: "pair",
        state: "experiment",
        revision: 6,
        evidence: { left: "mug", right: "lamp", observedOrders: 3 },
      },
    ],
  }));
  wrap(<MemoryView request={request} products={products} canWrite />);
  expect(
    await screen.findByRole("heading", { name: /Fixture mug/ }),
  ).toBeVisible();
  expect(screen.getByText("With real payment")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Mark for investigation" }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", { name: "Use for recommendations" }),
  );
  expect(screen.getByRole("dialog")).toHaveTextContent(
    "Marking for investigation does not start an experiment",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm decision" }),
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/api/intelligence/hypotheses/pair",
      { state: "published", revision: 6, approve: true },
      "PUT",
    ),
  );
});
it("all knowledge interface vocabulary is supplied in English, German, French and Spanish", () => {
  for (const values of Object.values(knowledgeWords)) {
    expect(values).toHaveLength(4);
    expect(values.every((v) => v.trim().length)).toBe(true);
  }
});

it("product explorer reads current facts and walks product-specific connections beyond overview samples", async () => {
  const onProduct = vi.fn();
  const request = vi.fn(async (path: string) =>
    path === "/api/search/product"
      ? { elements: [{ id: "rare", name: "Rare catalogue product" }] }
      : {
          product: {
            id: "mug",
            name: "Fixture mug",
            price: 19,
            stock: 42,
            revision: 7,
            product_number: "SKU-42",
            properties: { material: "Ceramic" },
            extra: { specifications: { capacity: "500 ml" } },
            media: [],
          },
          stats: { variants: 2, reviews: 4, averageRating: 4.5 },
          needs: [],
          complements: [],
          observed: [],
          sources: [
            {
              id: "guide",
              title: "Care guide",
              kind: "care",
              visibility: "private",
              productId: "mug",
            },
          ],
          external: [],
          limit: 50,
        },
  );
  wrap(
    <KnowledgeExplorer
      focus="mug"
      products={products}
      request={request}
      onProduct={onProduct}
      onIntent={vi.fn()}
    />,
  );
  expect(await screen.findByText("SKU-42")).toBeVisible();
  expect(screen.getByText("500 ml")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /Open product/ }));
  expect(onProduct).toHaveBeenCalledWith("mug");
  await userEvent.type(
    screen.getByRole("textbox", { name: "Find product" }),
    "rare",
  );
  await userEvent.click(screen.getByRole("button", { name: "Find product" }));
  await userEvent.click(
    await screen.findByRole("button", { name: /Rare catalogue product/ }),
  );
  expect(request).toHaveBeenCalledWith("/api/knowledge/product/rare");
});

it("source upload keeps translated metadata in the actual multipart request", async () => {
  const request = vi.fn(async (..._args: unknown[]) => ({}));
  wrap(
    <SourceEditor
      workspace={workspace}
      request={request}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "Title" }),
    "Uploaded guide",
  );
  await userEvent.upload(
    screen.getByLabelText(/^Upload PDF/),
    new File(["Handle carefully"], "care.txt", { type: "text/plain" }),
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Content language" }),
    "de-DE",
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "Title" }),
    "Anleitung",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save source" }));
  expect(request).toHaveBeenCalledWith(
    "/api/knowledge/documents/upload",
    expect.any(FormData),
  );
  const form = request.mock.calls[0][1] as FormData;
  expect(form.get("locale")).toBe("en-GB");
  expect(JSON.parse(form.get("translations") as string)).toEqual({
    "de-DE": { title: "Anleitung" },
  });
  expect((form.get("file") as File).name).toBe("care.txt");
});
