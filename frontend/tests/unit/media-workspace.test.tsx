/** Gallery regressions exercise visible selection, modal focus, bounded uploads and non-fabricated translations. */
import { useState } from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { ContentLanguage } from "../../src/shared/i18n/ContentLanguage";
import ProductMediaWorkspace from "../../src/admin/catalog/ProductMediaWorkspace";
import type { ProductDraft } from "../../src/admin/catalog/catalog-model";
import { newDraft } from "../../src/admin/catalog/catalog-model";
import { moveImage, validImages } from "../../src/admin/catalog/media-model";
import { PreviewPanel } from "../../src/admin/preview/PreviewPanel";
import MethodRemoval from "../../src/admin/settings/MethodRemoval";
it("sets a cover, edits one alt language and cancels/removes through a focused shared dialog", async () => {
  let last = {
    ...newDraft(),
    id: "product",
    commerce: {
      ...newDraft().commerce,
      media: [
        {
          id: "a",
          url: "/media/a.png",
          view: "Front",
          alt: { en: "Front", de: null },
        },
        { id: "b", url: "/media/b.png", view: "Back" },
      ],
    },
  };
  function Harness() {
    const [d, setD] = useState(last);
    return (
      <LocaleProvider>
        <ContentLanguage
          locales={["en-GB", "de-DE"]}
          mainLocale="en-GB"
          language="de-DE"
        >
          <ProductMediaWorkspace
            draft={d}
            request={vi.fn(async () => ({ configured: false }))}
            onChange={(v) => {
              last = v as typeof last;
              setD(v as typeof last);
            }}
          />
        </ContentLanguage>
      </LocaleProvider>
    );
  }
  render(<Harness />);
  const user = userEvent.setup();
  expect(screen.getByLabelText("Image description")).toHaveValue("");
  expect(screen.getByLabelText("Image description")).toHaveAttribute(
    "placeholder",
    "Front",
  );
  await user.type(screen.getByLabelText("Image description"), "Vorne");
  expect(last.commerce.media[0].alt?.de).toBe("Vorne");
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("button", { name: "Set as cover" }));
  expect(last.commerce.media[0].id).toBe("b");
  await user.click(screen.getByRole("button", { name: "Remove" }));
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(last.commerce.media).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Remove" }));
  await user.click(screen.getAllByRole("button", { name: "Remove" }).at(-1)!);
  expect(last.commerce.media).toHaveLength(1);
});
it("uploads a drop batch without copying filenames into every language", async () => {
  let last: ProductDraft = { ...newDraft(), id: "product" };
  const request = vi.fn(async (path: string, _body?: unknown) =>
    path.includes("/assets")
      ? { id: "uploaded", digest: "hash", shop: "fixture" }
      : { configured: false },
  );
  function Harness() {
    const [d, setD] = useState(last);
    return (
      <LocaleProvider>
        <ContentLanguage locales={["en-GB", "de-DE"]} mainLocale="en-GB">
          <ProductMediaWorkspace
            draft={d}
            request={request}
            onChange={(v) => {
              last = v;
              setD(v);
            }}
          />
        </ContentLanguage>
      </LocaleProvider>
    );
  }
  const { container } = render(<Harness />);
  fireEvent.drop(container.querySelector(".media-dropzone")!, {
    dataTransfer: {
      files: [new File(["image"], "front.png", { type: "image/png" })],
    },
  });
  await waitFor(() => expect(last.commerce.media).toHaveLength(1));
  const form = request.mock.calls.find(([p]) =>
    p.endsWith("/assets"),
  )?.[1] as unknown as FormData;
  expect(JSON.parse(form.get("title") as string)).toEqual({
    "en-GB": "front.png",
  });
  expect(last.commerce.media[0].alt).toEqual({ "en-GB": "front.png" });
});
it("blocks removal on references, offers deactivation and keeps API failures closed", async () => {
  const cancel = vi.fn(),
    remove = vi.fn(),
    deactivate = vi.fn();
  render(
    <LocaleProvider>
      <MethodRemoval
        area="shipping"
        id="used"
        request={vi.fn(async () => ({
          canDelete: false,
          orders: 2,
          carts: 1,
          overrides: 0,
          rules: 0,
        }))}
        onCancel={cancel}
        onRemove={remove}
        onDeactivate={deactivate}
      />
    </LocaleProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
  expect(deactivate).toHaveBeenCalledOnce();
  expect(remove).not.toHaveBeenCalled();
});
it("rejects unsupported/oversize image batches and keeps order on an invalid move", () => {
  const a = [
    { id: "a", url: "/a", view: "" },
    { id: "b", url: "/b", view: "" },
  ];
  expect(moveImage(a, 1, 0).map((m) => m.id)).toEqual(["b", "a"]);
  expect(moveImage(a, 2, 0)).toBe(a);
  expect(
    validImages([new File(["x"], "x.svg", { type: "image/svg+xml" })], 0),
  ).toBe(false);
  expect(
    validImages([new File(["x"], "x.png", { type: "image/png" })], 20),
  ).toBe(false);
});

it("renders the assistant preview from the real gallery and removes the image when the gallery is empty", () => {
  const p = {
    id: "vase",
    name: "Studio Vase",
    description: "Synthetic vase",
    category: "objects",
    price: 49.9,
    stock: 2,
    revision: 1,
    tax_rate: 19,
    min_purchase: 1,
    purchase_steps: 1,
    advanced_prices: [],
    media: [{ id: "photo", url: "/media/actual-vase.png", view: "Vase" }],
  };
  const props = { request: vi.fn(), connected: false, onIntent: vi.fn() };
  const { rerender } = render(
    <LocaleProvider>
      <PreviewPanel {...props} product={p} />
    </LocaleProvider>,
  );
  expect(screen.getByRole("img", { name: "Studio Vase" })).toHaveAttribute(
    "src",
    "/media/actual-vase.png",
  );
  rerender(
    <LocaleProvider>
      <PreviewPanel {...props} product={{ ...p, media: [] }} />
    </LocaleProvider>,
  );
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("No saved gallery images")).toBeVisible();
});
