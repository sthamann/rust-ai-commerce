/** Rendered product page preserves gallery, variant, tier-price, rich content and review workflows. */
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import ProductPage from "../../src/storefront/catalog/ProductPage";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { cart, detail, product } from "./fixtures";
import type { Detail } from "../../src/shared/api/shop-api";
function fixture(data: Detail) {
  return vi.fn(async (path: string) => {
    const value = path.endsWith("/attachments")
      ? { elements: [] }
      : path.includes("/recommendations/")
        ? {
            elements: [
              {
                id: "fixture-cross",
                name: "Fixture recommendation",
                price: 12,
              },
            ],
          }
        : path === "/store-api/apps/slots"
          ? { slots: [] }
          : path.endsWith("/reviews")
            ? { id: "review-fixture" }
            : path.startsWith("/store-api/product/")
              ? data
              : undefined;
    if (!value) throw new Error(`Unspecified product fixture: ${path}`);
    return { ok: true, status: 200, json: async () => value };
  });
}
it("switches gallery/variants, applies normalized quantity and displays authoritative tier price", async () => {
  const data: Detail = {
    ...detail,
    product: {
      ...product,
      stock: 20,
      min_purchase: 2,
      purchase_steps: 2,
      max_purchase: 10,
      media: [
        ...product.media,
        { id: "rear", view: "back", url: "/rear-fixture.svg" },
      ],
      extra: {
        seo: {
          en: {
            title: "Fixture SEO title",
            description: "Fixture SEO description",
            slug: "fixture-lamp",
          },
        },
        specifications: { en: { wattage: "15 W" } },
        crossSelling: ["fixture-cross"],
      },
    },
    variants: [
      product,
      { ...product, id: "red-lamp", options: { color: "red" } },
    ],
    calculatedPrices: [
      detail.calculatedPrices[0],
      {
        quantity: 4,
        price: {
          unitPrice: 40,
          totalPrice: 160,
          listPrice: { price: 50, percentage: 20 },
        },
        discountPercent: 20,
      },
    ],
  };
  vi.stubGlobal("fetch", fixture(data));
  const onAdd = vi.fn();
  render(
    <ProductPage
      id="lamp"
      cart={cart}
      busy={false}
      onAdd={onAdd}
      onCart={() => {}}
    />,
    { wrapper: LocaleProvider },
  );
  await screen.findByRole("heading", { name: "Unit lamp", level: 1 });
  // SEO is applied by a post-render effect; heading presence alone is not a
  // synchronization point on slower CI runners.
  await waitFor(() => expect(document.title).toBe("Fixture SEO title"));
  expect(screen.getByText("15 W")).toBeInTheDocument();
  expect(await screen.findByText("Fixture recommendation")).toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Back to collection" }));
  expect(document.querySelector(".gallery-main img")).toHaveAttribute(
    "src",
    "/rear-fixture.svg",
  );
  const quantity = screen.getByRole("spinbutton");
  fireEvent.change(quantity, { target: { value: "5" } });
  fireEvent.blur(quantity);
  expect(quantity).toHaveValue(4);
  expect(document.querySelector(".pdp-price strong")).toHaveTextContent(
    "€40.00",
  );
  await user.click(screen.getByRole("button", { name: /Add to/i }));
  expect(onAdd).toHaveBeenCalledWith("lamp", 4);
  await user.click(screen.getByRole("button", { name: "red" }));
  expect(location.hash).toBe("#product/red-lamp");
});
it("submits a review using checkout identity and confirms pending moderation", async () => {
  const fetcher = fixture(detail);
  vi.stubGlobal("fetch", fetcher);
  render(
    <ProductPage
      id="lamp"
      cart={cart}
      busy={false}
      onAdd={() => {}}
      onCart={() => {}}
    />,
    { wrapper: LocaleProvider },
  );
  await screen.findByRole("heading", { name: "Unit lamp", level: 1 });
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Your name"), "Fixture author");
  await user.type(
    screen.getByLabelText("Title", { exact: true }),
    "Fixture review",
  );
  await user.type(
    screen.getByLabelText("Your experience"),
    "Useful fixture lamp",
  );
  await user.click(screen.getByRole("button", { name: /Submit review/i }));
  await waitFor(() =>
    expect(screen.queryByLabelText("Your experience")).not.toBeInTheDocument(),
  );
  expect(
    fetcher.mock.calls.some(
      ([path]) => path === "/store-api/product/lamp/reviews",
    ),
  ).toBe(true);
});
it("reports a failed detail load instead of rendering purchase controls", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Product unavailable")),
  );
  render(
    <ProductPage
      id="lamp"
      cart={cart}
      busy={false}
      onAdd={() => {}}
      onCart={() => {}}
    />,
    { wrapper: LocaleProvider },
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Product unavailable",
  );
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
});

it("renders an honest empty gallery and merchant product number for a new product", async () => {
  vi.stubGlobal(
    "fetch",
    fixture({
      ...detail,
      product: { ...product, media: [], product_number: "STUDIO-001" },
    }),
  );
  const { container } = render(
    <ProductPage
      id="lamp"
      cart={cart}
      busy={false}
      onAdd={() => {}}
      onCart={() => {}}
    />,
    { wrapper: LocaleProvider },
  );
  expect(
    await screen.findByRole("img", { name: "No image yet" }),
  ).toBeInTheDocument();
  expect(container.querySelector(".gallery-main img")).toBeNull();
  expect(screen.getByText("SKU STUDIO-001")).toBeInTheDocument();
  expect(container.querySelector(".gallery-main")).not.toHaveTextContent(
    "1 / 0",
  );
});
